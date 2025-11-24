"""
Скрипт для инициализации базы данных и генерации данных
"""
import sys
import os

# Добавляем родительскую директорию в путь
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.database import engine, Base, SessionLocal
from app.data_generator import generate_all_data

def init_db():
    """Создание таблиц и генерация данных"""
    print("Создание таблиц...")
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # Проверяем, есть ли уже данные
        from app.models import Student, User
        existing_students = db.query(Student).count()
        existing_users = db.query(User).count()
        
        if existing_students > 0 and existing_users > 0:
            print(f"В базе уже есть {existing_students} студентов и {existing_users} пользователей. Пропускаем генерацию.")
            return
        
        if existing_students == 0:
            print("Генерация данных...")
            generate_all_data(db)
        elif existing_users == 0:
            # Если есть студенты, но нет пользователей - создаем только пользователей
            print("Создание пользователей...")
            from app.data_generator import generate_users
            from app.models import Student, Teacher
            students = db.query(Student).all()
            teachers = db.query(Teacher).all()
            generate_users(db, students, teachers)
            print("Пользователи созданы!")
        else:
            print("Генерация данных...")
            generate_all_data(db)
        
        print("База данных инициализирована!")
    except Exception as e:
        print(f"Ошибка: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    init_db()

