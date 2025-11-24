#!/bin/bash
# Скрипт для локального запуска backend

cd "$(dirname "$0")"

# Устанавливаем PYTHONPATH
export PYTHONPATH="${PYTHONPATH}:$(pwd)"

# Проверяем, инициализирована ли БД
if [ ! -f "edupulse.db" ] && [ -z "$DATABASE_URL" ]; then
    echo "Инициализация базы данных..."
    python3 app/init_db.py
fi

# Запускаем сервер
echo "Запуск сервера на http://localhost:8000"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

