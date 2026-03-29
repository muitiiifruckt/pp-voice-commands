# Система распознавания голосовых команд (VOSK + FastAPI + React)

MVP: запись с микрофона, распознавание речи (VOSK), разбор команды и идентификатора, сохранение аудио и метаданных в SQLite, веб-интерфейс с историей, подтверждением оператора и администрированием пользователей.

## Требования

- Python 3.11+
- Node.js 20+ (для сборки фронтенда)
- [FFmpeg](https://ffmpeg.org/) в `PATH` (конвертация WebM/прочих форматов в WAV 16 kHz mono)
- Модель VOSK, например [vosk-model-small-ru-0.22](https://alphacephei.com/vosk/models): скачайте **полный** zip и распакуйте **в каталог `backend`** рядом с `app/`, чтобы было `backend/vosk-model-small-ru-0.22/am/...`. Нужны `am/final.mdl`, `conf/`, `ivector/` и граф **`graph/HCLG.fst`** или **`graph/Gr.fst` + `graph/HCLr.fst`**. В `.env` достаточно **`VOSK_MODEL=vosk-model-small-ru-0.22`** (имя папки) или относительного пути от `backend/`, например `models/vosk-model-small-ru-0.22`. Для произвольного места задайте **`VOSK_MODEL_PATH`** (абсолютный или относительно `backend/`). На Windows при ошибках Vosk из‑за кириллицы в пути к проекту укажите **`VOSK_MODEL_PATH`** на каталог **без кириллицы** (например `C:/Models/...`).

## Быстрый старт (разработка)

### 1. Бэкенд

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# Положите распакованную модель в backend/<имя> и при необходимости смените VOSK_MODEL
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 2. Фронтенд

```powershell
cd frontend
npm install
npm run dev
```

Откройте в браузере адрес, который покажет Vite (обычно `http://127.0.0.1:5173`). Запросы к `/api` проксируются на порт 8000.

### Учётные записи по умолчанию

После первого запуска создаются:

| Логин    | Пароль       | Роль     |
|----------|--------------|----------|
| admin    | admin123     | admin    |
| operator | operator123  | operator |

Смените пароли в реальной среде.

## Продакшен (сборка фронтенда)

```powershell
cd frontend
npm run build
```

Статическая сборка — каталог `frontend/dist`. Для выдачи через тот же хост можно настроить nginx/Caddy: API на `/api` → `127.0.0.1:8000`, остальное — из `dist`.

## API (кратко)

- `POST /api/auth/token` — OAuth2 password (form: `username`, `password`)
- `GET /api/me` — текущий пользователь
- `POST /api/voice/upload` — multipart `file` (аудио)
- `GET /api/voice/records` — список с фильтрами `command`, `identifier`, `date_from`, `date_to`, `operator_id` (последний — только админ)
- `POST /api/voice/records/{id}/confirm` — подтверждение и правка текста
- `GET /api/voice/audio/{filename}` — скачать/прослушать файл (с заголовком `Authorization: Bearer ...`)
- `GET/POST/PATCH /api/users` — управление пользователями (админ)

Интерактивная документация: `http://127.0.0.1:8000/docs`.

## Публикация для проверки

1. Создайте публичный репозиторий (GitHub / GitLab / Bitbucket).
2. Загрузите исходники (без `node_modules`, `.venv`, `backend/data`, `backend/storage`).
3. В отчёте укажите ссылку и приложите архив при необходимости.

Подробное описание для критериев задания (БД, UML, DFD, ИИ) — файл [docs/TECHNICAL_SOLUTION_RU.md](docs/TECHNICAL_SOLUTION_RU.md).
