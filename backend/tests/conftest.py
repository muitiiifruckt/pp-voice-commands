"""
Переменные окружения до импорта приложения: отдельный файл БД для тестов.
Запуск из каталога backend: pytest tests/
"""

from __future__ import annotations

import atexit
import os
import tempfile

_fd, _TEST_DB_PATH = tempfile.mkstemp(suffix=".sqlite")
os.close(_fd)

# sqlite URL: слэши в пути для Windows
_db_url = "sqlite:///" + _TEST_DB_PATH.replace("\\", "/")
os.environ.setdefault("DATABASE_URL", _db_url)
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only")
# Не тянуть реальную модель при случайном импорте asr в других тестах
os.environ.setdefault("VOSK_MODEL", "test-model-not-used")


def _remove_test_db() -> None:
    try:
        os.unlink(_TEST_DB_PATH)
    except OSError:
        pass


atexit.register(_remove_test_db)

import pytest
from fastapi.testclient import TestClient

import app.main as main_app
from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    """TestClient + аудио в tmp, без реального Vosk."""
    audio = tmp_path / "audio"
    audio.mkdir()
    monkeypatch.setattr(main_app.settings, "audio_dir", audio)

    def fake_transcribe(_path):
        return "зарегистрировать трубу номер р 45345"

    monkeypatch.setattr(main_app, "transcribe_file", fake_transcribe)

    with TestClient(app) as c:
        yield c


@pytest.fixture
def admin_headers(client) -> dict[str, str]:
    r = client.post(
        "/api/auth/token",
        data={"username": "admin", "password": "admin123"},
    )
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def operator_headers(client) -> dict[str, str]:
    r = client.post(
        "/api/auth/token",
        data={"username": "operator", "password": "operator123"},
    )
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
