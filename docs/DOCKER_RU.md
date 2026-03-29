# Запуск в Docker

Полный стек: **API** (FastAPI, Vosk, FFmpeg, SQLite) + **веб** (собранный React за nginx с прокси `/api`).

**Альтернатива без Docker** (Python + Node + Vite на хосте): раздел **«Запуск» → вариант 2** в корневом [README.md](../README.md).

## Требования

- Docker и Docker Compose v2
- Распакованная модель Vosk на хосте (образ не содержит модель из‑за размера)

## Шаги

1. Скачайте модель с [alphacephei.com/vosk/models](https://alphacephei.com/vosk/models) и распакуйте, например в каталог репозитория:
   - `models/vosk-model-small-ru-0.22/`  
   Либо укажите свой путь через переменную окружения (см. ниже).

2. (Необязательно) Скопируйте `docker-compose.example.env` в `.env` в **корне репозитория** и поправьте `VOSK_MODEL_HOST_PATH`.

3. Из корня репозитория:

   ```bash
   docker compose up --build
   ```

4. Откройте в браузере:
   - **Приложение:** http://localhost  
   - **Swagger API:** http://localhost:8000/docs (порт API проброшен отдельно)

Учётные записи по умолчанию создаются при первом старте API: `admin` / `admin123`, `operator` / `operator123`.

## Переменные окружения

| Переменная | Назначение |
|------------|------------|
| `VOSK_MODEL_HOST_PATH` | Путь на хосте к каталогу модели (по умолчанию `./models/vosk-model-small-ru-0.22`) |
| `SECRET_KEY` | Секрет для JWT (в `docker-compose.yml` задан запасной дефолт для демо) |

Переменные можно задать в файле `.env` рядом с `docker-compose.yml` или экспортировать в shell перед `docker compose up`.

## Тома и данные

- **`app_data`** — файл SQLite (`/app/data/app.db` в контейнере), переживает перезапуск контейнера.
- **`app_audio`** — загруженные аудиофайлы (`/app/storage` в контейнере).

Команда `docker compose down` **без** флага `-v` тома не удаляет. Чтобы сбросить БД и файлы: `docker compose down -v`.

## Порт 80 занят

В `docker-compose.yml` для сервиса `web` замените, например, на `"8080:80"` и открывайте http://localhost:8080.

## Поведение без модели

Если путь `VOSK_MODEL_HOST_PATH` пустой или в нём нет валидной модели Vosk, контейнер `api` всё равно запустится, но запросы распознавания завершатся ошибкой. Убедитесь, что в смонтированном `/model` есть `am/final.mdl` и граф в `graph/`.

## Переопределение каталога аудио

Внутри контейнера по умолчанию используется `/app/storage/audio`. При необходимости задайте переменную **`AUDIO_DIR`** для сервиса `api` (см. [backend/app/config.py](../backend/app/config.py)).
