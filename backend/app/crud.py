from datetime import datetime
from typing import Sequence

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.auth import hash_password


def create_user(db: Session, data: schemas.UserCreate) -> models.User:
    user = models.User(
        username=data.username,
        hashed_password=hash_password(data.password),
        role=models.UserRole(data.role.value),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def list_users(db: Session) -> Sequence[models.User]:
    return db.query(models.User).order_by(models.User.id).all()


def get_user(db: Session, user_id: int) -> models.User | None:
    return db.query(models.User).filter(models.User.id == user_id).first()


def update_user(db: Session, user: models.User, data: schemas.UserUpdate) -> models.User:
    if data.role is not None:
        user.role = models.UserRole(data.role.value)
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.password:
        user.hashed_password = hash_password(data.password)
    db.commit()
    db.refresh(user)
    return user


def create_voice_record(
    db: Session,
    user_id: int,
    audio_filename: str,
    raw_transcript: str,
    parsed_command: str | None,
    parsed_identifier: str | None,
) -> models.VoiceRecord:
    row = models.VoiceRecord(
        user_id=user_id,
        audio_filename=audio_filename,
        raw_transcript=raw_transcript,
        parsed_command=parsed_command,
        parsed_identifier=parsed_identifier,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return (
        db.query(models.VoiceRecord)
        .options(joinedload(models.VoiceRecord.user))
        .filter(models.VoiceRecord.id == row.id)
        .first()
        or row
    )


def confirm_voice_record(
    db: Session,
    row: models.VoiceRecord,
    body: schemas.VoiceRecordConfirm,
) -> models.VoiceRecord:
    row.confirmed_transcript = body.confirmed_transcript
    row.is_confirmed = True
    row.operator_confirmed_at = datetime.utcnow()
    if body.parsed_command is not None:
        row.parsed_command = body.parsed_command
    if body.parsed_identifier is not None:
        row.parsed_identifier = body.parsed_identifier
    db.commit()
    db.refresh(row)
    return row


def list_voice_records(
    db: Session,
    current_user: models.User,
    command: str | None = None,
    identifier: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    operator_id: int | None = None,
) -> Sequence[models.VoiceRecord]:
    q = db.query(models.VoiceRecord).options(joinedload(models.VoiceRecord.user))
    if current_user.role != models.UserRole.admin:
        q = q.filter(models.VoiceRecord.user_id == current_user.id)
    if operator_id is not None:
        if current_user.role != models.UserRole.admin:
            operator_id = current_user.id
        q = q.filter(models.VoiceRecord.user_id == operator_id)
    if command:
        like = f"%{command.lower()}%"
        q = q.filter(
            or_(
                models.VoiceRecord.parsed_command.ilike(like),
                models.VoiceRecord.raw_transcript.ilike(like),
                models.VoiceRecord.confirmed_transcript.ilike(like),
            )
        )
    if identifier:
        like = f"%{identifier}%"
        q = q.filter(
            or_(
                models.VoiceRecord.parsed_identifier.ilike(like),
                models.VoiceRecord.raw_transcript.ilike(like),
                models.VoiceRecord.confirmed_transcript.ilike(like),
            )
        )
    if date_from:
        q = q.filter(models.VoiceRecord.created_at >= date_from)
    if date_to:
        q = q.filter(models.VoiceRecord.created_at <= date_to)
    return q.order_by(models.VoiceRecord.created_at.desc()).all()


def get_voice_record(db: Session, record_id: int, user: models.User) -> models.VoiceRecord | None:
    row = (
        db.query(models.VoiceRecord)
        .options(joinedload(models.VoiceRecord.user))
        .filter(models.VoiceRecord.id == record_id)
        .first()
    )
    if not row:
        return None
    if user.role != models.UserRole.admin and row.user_id != user.id:
        return None
    return row
