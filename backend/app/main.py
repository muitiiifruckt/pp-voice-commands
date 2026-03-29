import uuid
from datetime import datetime
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.asr import transcribe_file
from app.auth import (
    authenticate_user,
    create_access_token,
    get_current_user,
    get_user_by_username,
    require_admin,
)
from app.config import settings
from app.database import Base, SessionLocal, engine, get_db
from app.parser import parse_voice_command

settings.audio_dir.mkdir(parents=True, exist_ok=True)
(Path(__file__).resolve().parent.parent / "data").mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Голосовые команды (VOSK)", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(models.User).count() == 0:
            from app.auth import hash_password

            admin = models.User(
                username="admin",
                hashed_password=hash_password("admin123"),
                role=models.UserRole.admin,
            )
            db.add(admin)
            op = models.User(
                username="operator",
                hashed_password=hash_password("operator123"),
                role=models.UserRole.operator,
            )
            db.add(op)
            db.commit()
    finally:
        db.close()


@app.post("/api/auth/token", response_model=schemas.Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = authenticate_user(db, form.username, form.password)
    if not user:
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    return schemas.Token(access_token=create_access_token(user.username))


@app.get("/api/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(get_current_user)):
    return user


@app.get("/api/users", response_model=list[schemas.UserOut])
def users_list(_: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    return crud.list_users(db)


@app.post("/api/users", response_model=schemas.UserOut)
def users_create(
    body: schemas.UserCreate,
    _: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if get_user_by_username(db, body.username):
        raise HTTPException(status_code=400, detail="Пользователь уже существует")
    return crud.create_user(db, body)


@app.patch("/api/users/{user_id}", response_model=schemas.UserOut)
def users_patch(
    user_id: int,
    body: schemas.UserUpdate,
    _: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    u = crud.get_user(db, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return crud.update_user(db, u, body)


@app.post("/api/voice/upload", response_model=schemas.VoiceRecordOut)
async def voice_upload(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role != models.UserRole.admin and user.role != models.UserRole.operator:
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    ext = Path(file.filename or "audio").suffix or ".webm"
    safe_name = f"{uuid.uuid4().hex}{ext}"
    dest = settings.audio_dir / safe_name
    content = await file.read()
    dest.write_bytes(content)

    try:
        text = transcribe_file(dest)
    except Exception as e:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=str(e)) from e

    cmd, ident = parse_voice_command(text)
    row = crud.create_voice_record(db, user.id, safe_name, text, cmd, ident)
    return voice_record_to_out(row)


def voice_record_to_out(row: models.VoiceRecord) -> schemas.VoiceRecordOut:
    return schemas.VoiceRecordOut(
        id=row.id,
        user_id=row.user_id,
        username=row.user.username if row.user else None,
        audio_url=f"/api/voice/audio/{row.audio_filename}",
        raw_transcript=row.raw_transcript,
        parsed_command=row.parsed_command,
        parsed_identifier=row.parsed_identifier,
        confirmed_transcript=row.confirmed_transcript,
        is_confirmed=row.is_confirmed,
        operator_confirmed_at=row.operator_confirmed_at,
        created_at=row.created_at,
    )


@app.get("/api/voice/records", response_model=list[schemas.VoiceRecordOut])
def voice_records(
    command: str | None = None,
    identifier: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    operator_id: int | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    rows = crud.list_voice_records(
        db,
        user,
        command=command,
        identifier=identifier,
        date_from=date_from,
        date_to=date_to,
        operator_id=operator_id,
    )
    return [voice_record_to_out(r) for r in rows]


@app.get("/api/voice/records/{record_id}", response_model=schemas.VoiceRecordOut)
def voice_record_get(
    record_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    row = crud.get_voice_record(db, record_id, user)
    if not row:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    return voice_record_to_out(row)


@app.post("/api/voice/records/{record_id}/confirm", response_model=schemas.VoiceRecordOut)
def voice_record_confirm(
    record_id: int,
    body: schemas.VoiceRecordConfirm,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    row = crud.get_voice_record(db, record_id, user)
    if not row:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    row = crud.confirm_voice_record(db, row, body)
    return voice_record_to_out(row)


@app.get("/api/voice/audio/{filename}")
def voice_audio(
    filename: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Проверка: файл принадлежит записи пользователя или админ
    safe = Path(filename).name
    path = settings.audio_dir / safe
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Файл не найден")
    row = db.query(models.VoiceRecord).filter(models.VoiceRecord.audio_filename == safe).first()
    if not row:
        raise HTTPException(status_code=404, detail="Файл не найден")
    if user.role != models.UserRole.admin and row.user_id != user.id:
        raise HTTPException(status_code=403, detail="Нет доступа")
    return FileResponse(path, filename=safe)


@app.get("/api/health")
def health():
    return {"ok": True}
