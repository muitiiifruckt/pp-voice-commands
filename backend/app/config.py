import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


_BASE = Path(__file__).resolve().parent.parent
_DATA = _BASE / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_BASE / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    secret_key: str = "change-me-in-production-use-long-random-string"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    database_url: str = "sqlite:///" + (_DATA / "app.db").as_posix()

    #: Имя или относительный путь от каталога backend/, env: VOSK_MODEL (напр. vosk-model-small-ru-0.22)
    vosk_model: str = "vosk-model-small-ru-0.22"
    #: Абсолютный или относительно backend/ путь к модели; если задан — приоритет над vosk_model
    vosk_model_path: str = ""

    audio_dir: Path = _BASE / "storage" / "audio"

    def resolved_vosk_model_directory(self) -> Path:
        """Каталог модели: относительно папки backend/ (где лежит .env), если путь не абсолютный."""

        def _resolve_under_backend(p: Path) -> Path:
            if p.is_absolute():
                return p.expanduser().resolve()
            return (_BASE / p).resolve()

        raw = (self.vosk_model_path or "").strip()
        if raw:
            return _resolve_under_backend(Path(os.path.expandvars(raw.strip('"'))).expanduser())
        name = (self.vosk_model or "").strip()
        if not name:
            raise RuntimeError(
                "Задайте в .env VOSK_MODEL=имя_папки или относительный путь от backend/ "
                "(например models/my-model), либо VOSK_MODEL_PATH."
            )
        return _resolve_under_backend(Path(name))


settings = Settings()
