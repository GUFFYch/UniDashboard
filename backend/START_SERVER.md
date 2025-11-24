# Запуск Backend сервера вручную

## Команда для запуска:

```bash
cd /Users/dimmy-kor/Projects/uni_hackaton/backend
export PYTHONPATH="${PYTHONPATH}:$(pwd)"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Или используйте готовый скрипт:

```bash
cd /Users/dimmy-kor/Projects/uni_hackaton/backend
./run_local.sh
```

## Что происходит:

1. `cd backend` - переходим в директорию backend
2. `export PYTHONPATH` - добавляем текущую директорию в путь Python, чтобы модули `app.*` находились
3. `uvicorn app.main:app` - запускаем FastAPI сервер
4. `--reload` - автоматическая перезагрузка при изменении кода
5. `--host 0.0.0.0` - слушаем на всех интерфейсах
6. `--port 8000` - порт 8000

## После запуска:

- Сервер будет доступен на: http://localhost:8000
- API документация: http://localhost:8000/docs
- Для остановки нажмите `Ctrl+C`

