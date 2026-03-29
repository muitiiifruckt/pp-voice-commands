# Модель Vosk для Docker

Положите **распакованную** модель в подкаталог этого каталога, например:

`models/vosk-model-small-ru-0.22/` с папками `am/`, `graph/`, …

По умолчанию `docker-compose.yml` монтирует `./models/vosk-model-small-ru-0.22` в контейнер как `/model`.

Другой путь на диске можно задать переменной **`VOSK_MODEL_HOST_PATH`** (см. `docker-compose.example.env`).

Скачать модели: https://alphacephei.com/vosk/models
