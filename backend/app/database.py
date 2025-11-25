from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Используем SQLite для локальной разработки, если PostgreSQL недоступен
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    # Проверяем, доступен ли PostgreSQL
    try:
        import psycopg2
        test_conn = psycopg2.connect(
            host="localhost",
            port=5432,
            user="edupulse",
            password="edupulse",
            database="edupulse",
            connect_timeout=2
        )
        test_conn.close()
        DATABASE_URL = "postgresql://edupulse:edupulse@localhost:5432/edupulse"
    except:
        # Используем SQLite как fallback
        # Определяем путь к директории backend
        backend_dir = Path(__file__).parent.parent
        # Проверяем, какая база данных существует
        if (backend_dir / "mirea_synapse.db").exists():
            DATABASE_URL = f"sqlite:///{backend_dir / 'mirea_synapse.db'}"
        else:
            DATABASE_URL = f"sqlite:///{backend_dir / 'edupulse.db'}"

# Для SQLite нужен специальный параметр
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

