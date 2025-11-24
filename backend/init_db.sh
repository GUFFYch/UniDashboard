#!/bin/bash
# Скрипт для инициализации базы данных
cd "$(dirname "$0")"
export PYTHONPATH="${PYTHONPATH}:$(pwd)"
python3 -m app.init_db

