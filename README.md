# Система распознавания голосовых команд (VOSK + FastAPI + React)

MVP: запись с микрофона, распознавание речи (VOSK), разбор команды и идентификатора, сохранение аудио и метаданных в SQLite, веб-интерфейс с историей, подтверждением оператора и администрированием пользователей.

## Требования

Зависят от способа запуска (см. раздел **Запуск** ниже).

**Общее для любого варианта:** распакованная модель [Vosk](https://alphacephei.com/vosk/models) с полным набором файлов (`am/final.mdl`, `conf/`, `ivector/`, граф в `graph/` — **`HCLG.fst`** или **`Gr.fst` + `HCLr.fst`**).

- **Docker:** установленные **Docker** и **Docker Compose v2**. Python/Node/FFmpeg на хосте не нужны — они внутри образов. Модель монтируется с диска (в образ она не входит из‑за размера).
- **Локально:** **Python 3.11+**, **Node.js 20+**, **[FFmpeg](https://ffmpeg.org/)** в `PATH`. Модель удобно положить в каталог **`backend`** рядом с `app/` (например `backend/vosk-model-small-ru-0.22/`). В **`backend/.env`** укажите **`VOSK_MODEL`** (имя папки) или путь; для каталога **без кириллицы** используйте **`VOSK_MODEL_PATH`** (например `C:/Models/...` на Windows).

## Запуск

Два равноправных варианта: **всё в Docker** или **ручной запуск бэкенда и фронтенда** на своей машине.

### Вариант 1: Docker Compose (рекомендуется для проверки «как в проде»)

1. Установите [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/macOS) или Docker Engine + Compose (Linux).
2. Скачайте и **распакуйте** модель Vosk. По умолчанию compose ожидает путь  
   **`./models/vosk-model-small-ru-0.22`** относительно **корня репозитория** (создайте каталог `models`, см. [models/README.md](models/README.md)).  
   Другой путь задайте переменной **`VOSK_MODEL_HOST_PATH`** (можно в файле `.env` в корне репозитория — см. пример [docker-compose.example.env](docker-compose.example.env)).
3. В **корне репозитория** выполните:

   ```bash
   docker compose up --build
   ```

   Фоновый режим: `docker compose up -d --build`. Остановка: `Ctrl+C` или `docker compose down` (данные БД и аудио в томах сохраняются; сброс томов: `docker compose down -v`).

4. Откройте в браузере:
   - **http://localhost** — веб-интерфейс (nginx отдаёт SPA и проксирует **`/api`** на контейнер API);
   - **http://localhost:8000/docs** — Swagger (порт API проброшен отдельно).

Если порт **80** занят, в `docker-compose.yml` у сервиса `web` замените проброс, например на `"8080:80"`, и заходите на **http://localhost:8080**.

Расшифровка томов, переменных и типичных проблем: **[docs/DOCKER_RU.md](docs/DOCKER_RU.md)**.

### Вариант 2: Локально без Docker (удобно для разработки)

Нужны Python, Node.js и FFmpeg (см. **Требования**). Модель — в **`backend/`** (или путь в **`VOSK_MODEL_PATH`** в `backend/.env`).

**1. Бэкенд** (отдельный терминал):

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# Отредактируйте .env: VOSK_MODEL или VOSK_MODEL_PATH под ваш каталог модели
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**2. Фронтенд** (второй терминал):

```powershell
cd frontend
npm install
npm run dev
```

Откройте URL, который покажет Vite (обычно **http://127.0.0.1:5173**). Запросы к **`/api`** проксируются на **http://127.0.0.1:8000** (см. `frontend/vite.config.ts`).

### Учётные записи по умолчанию

После первого запуска бэкенда (в Docker или локально) в БД создаются:

| Логин    | Пароль       | Роль     |
|----------|--------------|----------|
| admin    | admin123     | admin    |
| operator | operator123  | operator |

Смените пароли в реальной среде.

## Демо

В каталоге `demo/` — видео работы приложения (в репозитории оно хранится через **Git LFS**; при клонировании нужен `git lfs install`). **В демо использовалась модель Vosk [vosk-model-ru-0.42](https://alphacephei.com/vosk/models)** (полная русская модель: дольше стартует и занимает больше места, чем `small-ru`, обычно выше качество распознавания).

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

**Документация:** индекс [docs/README.md](docs/README.md). Docker — [docs/DOCKER_RU.md](docs/DOCKER_RU.md). Полное описание системы и диаграммы — [docs/FULL_PROJECT_DOCUMENTATION_RU.md](docs/FULL_PROJECT_DOCUMENTATION_RU.md). Кратко по критериям задания (2.1–2.4) — [docs/TECHNICAL_SOLUTION_RU.md](docs/TECHNICAL_SOLUTION_RU.md). Промпты к ИИ — [docs/prompts/PROMPTS_RU.md](docs/prompts/PROMPTS_RU.md).
