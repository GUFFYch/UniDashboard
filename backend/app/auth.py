from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt
import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Student, Teacher

# Загружаем переменные окружения из .env файла
env_path = Path(__file__).parent.parent.parent / '.env'
if env_path.exists():
    load_dotenv(env_path)
else:
    load_dotenv()

# Секретный ключ для JWT (должен быть в переменных окружения в продакшене)
SECRET_KEY = os.getenv("SECRET_KEY", "edupulse-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(30 * 24 * 60)))  # 30 дней по умолчанию

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Проверка пароля"""
    try:
        # Если хеш начинается с $2b$, это bcrypt
        if hashed_password.startswith("$2b$") or hashed_password.startswith("$2a$"):
            return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
        # Иначе используем простую проверку (для совместимости)
        return plain_password == hashed_password
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """Хеширование пароля"""
    # Ограничиваем длину пароля до 72 байт для bcrypt
    password_bytes = password[:72].encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Создание JWT токена"""
    to_encode = data.copy()
    # Преобразуем user_id в строку для совместимости с jose
    if "sub" in to_encode:
        to_encode["sub"] = str(to_encode["sub"])
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    """Получение текущего пользователя из токена"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Не удалось подтвердить учетные данные",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id_raw = payload.get("sub")
        if user_id_raw is None:
            raise credentials_exception
        # Преобразуем в int, если это строка
        user_id = int(user_id_raw) if isinstance(user_id_raw, str) else user_id_raw
    except (JWTError, ValueError, TypeError) as e:
        raise credentials_exception
    
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Пользователь неактивен")
    return user


def get_current_student(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Student:
    """Получение студента текущего пользователя"""
    if current_user.role != "student" or not current_user.student_id:
        raise HTTPException(status_code=403, detail="Доступ запрещен: требуется роль студента")
    student = db.query(Student).filter(Student.id == current_user.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Студент не найден")
    return student


def get_current_teacher(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Teacher:
    """Получение преподавателя текущего пользователя"""
    if current_user.role != "teacher" or not current_user.teacher_id:
        raise HTTPException(status_code=403, detail="Доступ запрещен: требуется роль преподавателя")
    teacher = db.query(Teacher).filter(Teacher.id == current_user.teacher_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Преподаватель не найден")
    return teacher


def require_role(allowed_roles: list[str]):
    """Декоратор для проверки роли"""
    def role_checker(current_user: User = Depends(get_current_user)):
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Доступ запрещен: требуется одна из ролей {allowed_roles}"
            )
        return current_user
    return role_checker


def can_access_student(current_user: User, student_id: int, db: Session) -> bool:
    """Проверка, может ли пользователь получить доступ к информации о студенте"""
    if current_user.role == "admin":
        return True
    if current_user.role == "student":
        return current_user.student_id == student_id
    if current_user.role == "teacher":
        # Преподаватель может видеть только своих студентов
        from app.models import CourseTeacher, Grade
        teacher_courses = db.query(CourseTeacher.course_id).filter(
            CourseTeacher.teacher_id == current_user.teacher_id
        ).all()
        course_ids = [c[0] for c in teacher_courses]
        # Проверяем, есть ли у студента оценки по курсам преподавателя
        has_grades = db.query(Grade).filter(
            Grade.student_id == student_id,
            Grade.course_id.in_(course_ids)
        ).first()
        return has_grades is not None
    return False

