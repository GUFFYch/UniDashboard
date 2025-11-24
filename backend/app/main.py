from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, Integer, and_, or_, text, case
from sqlalchemy.exc import OperationalError
from datetime import date, timedelta, datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr
import hashlib

from app.database import get_db, engine, Base
from app.models import (
    User, Student, Course, Teacher, Grade, Attendance, Schedule,
    LibraryActivity, Event, Achievement, StudentPrediction, CourseTeacher,
    LoginLog, ActivityLog, AchievementTemplate, StudentAchievement
)
from app.achievements_new import (
    get_all_achievements_new, get_student_achievements_new,
    create_achievement_template_new, assign_achievement_new
)
from app.data_generator import generate_all_data
from app.ai_predictions import update_student_predictions
from app.ai_advisor import get_student_advice, get_teacher_advice, get_student_course_advice, get_admin_advice
from app.auth import (
    get_current_user, get_current_student, get_current_teacher,
    require_role, can_access_student, verify_password, get_password_hash,
    create_access_token
)

# Создаем таблицы
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="EduPulse API",
    description="API для системы мониторинга и анализа деятельности кафедры",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Pydantic схемы
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    role: str  # student, teacher, admin
    student_id: Optional[int] = None
    teacher_id: Optional[int] = None


class UserResponse(BaseModel):
    id: int
    email: str
    role: str
    student_id: Optional[int]
    teacher_id: Optional[int]

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


class AdminQueryRequest(BaseModel):
    query: str = ""


class StudentResponse(BaseModel):
    id: int
    name: str
    email: str
    group: Optional[str]
    year: Optional[int]
    is_headman: Optional[bool] = False  # Староста группы
    hash_id: Optional[str] = None  # Для безопасного доступа

    class Config:
        from_attributes = True


class CourseResponse(BaseModel):
    id: int
    name: str
    code: Optional[str]
    credits: Optional[int]
    semester: Optional[int]

    class Config:
        from_attributes = True


class GradeResponse(BaseModel):
    id: int
    student_id: int
    course_id: int
    value: float
    type: Optional[str]
    date: Optional[date]
    course_name: Optional[str] = None

    class Config:
        from_attributes = True


class AttendanceResponse(BaseModel):
    id: int
    student_id: int
    course_id: Optional[int]
    date: date
    present: bool
    building: Optional[str] = None
    entry_time: Optional[str] = None
    exit_time: Optional[str] = None
    course_name: Optional[str] = None

    class Config:
        from_attributes = True


class DashboardStats(BaseModel):
    total_students: int
    total_courses: int
    total_teachers: int
    average_gpa: float
    attendance_rate: float
    active_students_today: int


class StudentStats(BaseModel):
    student: StudentResponse
    gpa: float
    total_grades: int
    attendance_rate: float
    achievements_count: int
    burnout_risk: Optional[float]
    success_probability: Optional[float]
    predicted_gpa: Optional[float]
    rank: Optional[int] = None
    total_students: Optional[int] = None


def get_student_hash(student_id: int) -> str:
    """Генерация хеша для безопасного доступа к студенту"""
    return hashlib.sha256(f"student_{student_id}_secret".encode()).hexdigest()[:16]


def find_student_by_hash(hash_id: str, db: Session) -> Optional[Student]:
    """Получение студента по хешу (вспомогательная функция)"""
    students = db.query(Student).all()
    for student in students:
        if get_student_hash(student.id) == hash_id:
            return student
    return None


# API Endpoints

@app.get("/")
async def root():
    return {"message": "EduPulse API", "version": "1.0.0"}


@app.post("/api/auth/register", response_model=UserResponse)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Регистрация нового пользователя"""
    # Проверяем, существует ли пользователь
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Пользователь с таким email уже существует")
    
    # Проверяем роль и связанные ID
    if user_data.role == "student" and not user_data.student_id:
        raise HTTPException(status_code=400, detail="Для студента требуется student_id")
    if user_data.role == "teacher" and not user_data.teacher_id:
        raise HTTPException(status_code=400, detail="Для преподавателя требуется teacher_id")
    
    # Создаем пользователя
    hashed_password = get_password_hash(user_data.password)
    user = User(
        email=user_data.email,
        hashed_password=hashed_password,
        role=user_data.role,
        student_id=user_data.student_id,
        teacher_id=user_data.teacher_id
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/api/auth/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Авторизация пользователя"""
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Пользователь неактивен")
    
    access_token = create_access_token(data={"sub": user.id})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }


@app.get("/api/auth/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Получение информации о текущем пользователе"""
    return current_user


@app.post("/api/generate-data")
async def generate_data(db: Session = Depends(get_db)):
    """Генерация синтетических данных (только для разработки)"""
    try:
        generate_all_data(db)
        return {"message": "Данные успешно сгенерированы"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    groups: Optional[str] = None,  # Список групп через запятую
    department: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Получение общей статистики для дашборда"""
    # Фильтры в зависимости от роли
    student_filter = None
    course_filter = None
    
    if current_user.role == "student":
        student_filter = Student.id == current_user.student_id
    elif current_user.role == "teacher":
        # Только студенты, которые изучают курсы преподавателя
        teacher_courses = db.query(CourseTeacher.course_id).filter(
            CourseTeacher.teacher_id == current_user.teacher_id
        ).all()
        course_ids = [c[0] for c in teacher_courses]
        if course_ids:
            student_filter = Student.id.in_(
                db.query(Grade.student_id).filter(Grade.course_id.in_(course_ids)).distinct()
            )
        else:
            student_filter = Student.id == -1  # Нет студентов
    
    # Фильтр по кафедре (определяем по префиксу группы: ИТ-* или ПИ-*)
    if department:
        dept_filter = None
        if department == "ИТ":
            dept_filter = Student.group.like("ИТ-%")
        elif department == "ПИ":
            dept_filter = Student.group.like("ПИ-%")
        
        if dept_filter is not None:
            if student_filter is not None:
                student_filter = and_(student_filter, dept_filter)
            else:
                student_filter = dept_filter
    
    # Фильтр по группам (поддержка множественного выбора)
    if groups:
        group_list = [g.strip() for g in groups.split(',') if g.strip()]
        if group_list:
            group_filter = Student.group.in_(group_list)
            if student_filter is not None:
                student_filter = and_(student_filter, group_filter)
            else:
                student_filter = group_filter
    
    # Подсчет статистики
    query_students = db.query(Student)
    if student_filter is not None:
        query_students = query_students.filter(student_filter)
    
    total_students = query_students.count()
    
    query_grades = db.query(Grade)
    if student_filter is not None:
        student_ids = [s.id for s in query_students.all()]
        if student_ids:
            query_grades = query_grades.filter(Grade.student_id.in_(student_ids))
        else:
            query_grades = query_grades.filter(Grade.student_id == -1)
    
    avg_gpa = query_grades.with_entities(func.avg(Grade.value)).scalar() or 0.0
    
    total_courses = db.query(Course).count()
    if current_user.role == "teacher":
        teacher_courses = db.query(CourseTeacher.course_id).filter(
            CourseTeacher.teacher_id == current_user.teacher_id
        ).count()
        total_courses = teacher_courses
    
    total_teachers = db.query(Teacher).count()
    
    # Посещаемость
    # Используем только существующие поля для совместимости со старой схемой БД
    query_attendance = db.query(Attendance.id).filter(
        Attendance.date >= date.today() - timedelta(days=30)
    )
    if student_filter is not None:
        student_ids = [s.id for s in query_students.all()]
        if student_ids:
            query_attendance = query_attendance.filter(Attendance.student_id.in_(student_ids))
        else:
            query_attendance = query_attendance.filter(Attendance.student_id == -1)
    
    total_attendance = query_attendance.count()
    present_attendance = query_attendance.filter(Attendance.present == True).count()
    attendance_rate = (present_attendance / total_attendance * 100) if total_attendance > 0 else 0.0
    
    # Активные студенты сегодня - убрано (использовалась LMS активность)
    active_students_today = 0
    
    return DashboardStats(
        total_students=total_students,
        total_courses=total_courses,
        total_teachers=total_teachers,
        average_gpa=round(avg_gpa, 2),
        attendance_rate=round(attendance_rate, 2),
        active_students_today=active_students_today
    )


@app.get("/api/students", response_model=List[StudentResponse])
async def get_students(
    skip: int = 0,
    limit: int = 100,
    group: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получение списка студентов с проверкой прав доступа"""
    query = db.query(Student)
    
    # Фильтры по роли
    if current_user.role == "student":
        # Студент видит только себя
        query = query.filter(Student.id == current_user.student_id)
    elif current_user.role == "teacher":
        # Преподаватель видит только своих студентов
        teacher_courses = db.query(CourseTeacher.course_id).filter(
            CourseTeacher.teacher_id == current_user.teacher_id
        ).all()
        course_ids = [c[0] for c in teacher_courses]
        if course_ids:
            student_ids = db.query(Grade.student_id).filter(
                Grade.course_id.in_(course_ids)
            ).distinct().all()
            student_ids = [s[0] for s in student_ids]
            if student_ids:
                query = query.filter(Student.id.in_(student_ids))
            else:
                query = query.filter(Student.id == -1)
        else:
            query = query.filter(Student.id == -1)
    # admin видит всех
    
    if group:
        query = query.filter(Student.group == group)
    
    students = query.offset(skip).limit(limit).all()
    
    # Добавляем hash_id для безопасного доступа
    result = []
    for student in students:
        student_dict = {
            "id": student.id,
            "name": student.name,
            "email": student.email,
            "group": student.group,
            "year": student.year,
            "is_headman": getattr(student, 'is_headman', False),
            "hash_id": get_student_hash(student.id)
        }
        result.append(StudentResponse(**student_dict))
    
    return result


@app.get("/api/students/by-hash/{hash_id}", response_model=StudentStats)
async def get_student_by_hash(
    hash_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получение статистики студента по хешу"""
    student = find_student_by_hash(hash_id, db)
    if not student:
        raise HTTPException(status_code=404, detail="Студент не найден")
    
    # Проверка прав доступа
    if not can_access_student(current_user, student.id, db):
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    return await get_student_stats_internal(student.id, current_user, db)


@app.get("/api/students/me", response_model=StudentStats)
async def get_my_student_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получение статистики текущего студента"""
    if current_user.role != "student" or not current_user.student_id:
        raise HTTPException(status_code=403, detail="Доступ запрещен: требуется роль студента")
    
    return await get_student_stats_internal(current_user.student_id, current_user, db)


async def get_student_stats_internal(
    student_id: int,
    current_user: User,
    db: Session
) -> StudentStats:
    """Внутренняя функция для получения статистики студента"""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Студент не найден")
    
    # Обновляем предсказания
    update_student_predictions(db, student_id)
    
    # GPA
    gpa = db.query(func.avg(Grade.value)).filter(
        Grade.student_id == student_id
    ).scalar() or 0.0
    
    # Количество оценок
    total_grades = db.query(Grade).filter(Grade.student_id == student_id).count()
    
    # Посещаемость
    # Используем только существующие поля для совместимости со старой схемой БД
    total_attendance = db.query(Attendance.id).filter(
        Attendance.student_id == student_id,
        Attendance.date >= date.today() - timedelta(days=60)
    ).count()
    present_attendance = db.query(Attendance.id).filter(
        Attendance.student_id == student_id,
        Attendance.date >= date.today() - timedelta(days=60),
        Attendance.present == True
    ).count()
    attendance_rate = (present_attendance / total_attendance * 100) if total_attendance > 0 else 0.0
    
    # Достижения (для всех ролей, которые могут видеть статистику студента)
    achievements_count = 0
    # Проверяем, есть ли новая структура достижений
    try:
        db.execute(text("SELECT id FROM student_achievements LIMIT 1"))
        has_new_structure = True
    except OperationalError:
        has_new_structure = False
    
    if has_new_structure:
        # Используем новую структуру
        try:
            # Подсчитываем достижения студента, исключая удаленные шаблоны
            achievements_count = db.query(func.count(StudentAchievement.id)).join(
                AchievementTemplate
            ).filter(
                StudentAchievement.student_id == student_id,
                AchievementTemplate.deleted == False
            ).scalar() or 0
        except Exception:
            achievements_count = 0
    else:
        # Используем старую структуру для обратной совместимости
        try:
            result = db.execute(
                text("SELECT COUNT(*) FROM achievements WHERE student_id = :student_id"),
                {"student_id": student_id}
            )
            achievements_count = result.scalar() or 0
        except Exception:
            achievements_count = 0
    
    # Предсказания
    prediction = db.query(StudentPrediction).filter(
        StudentPrediction.student_id == student_id
    ).first()
    
    # Рейтинг (только для студента)
    rank = None
    total_students = None
    if current_user.role == "student":
        # Вычисляем рейтинг студента
        all_gpas = db.query(
            Student.id,
            func.avg(Grade.value).label('gpa')
        ).join(
            Grade, Student.id == Grade.student_id
        ).group_by(
            Student.id
        ).having(
            func.count(Grade.id) >= 5
        ).order_by(desc('gpa')).all()
        
        total_students = len(all_gpas)
        for idx, (sid, avg_gpa) in enumerate(all_gpas, 1):
            if sid == student_id:
                rank = idx
                break
    
    student_dict = {
        "id": student.id,
        "name": student.name,
        "email": student.email,
        "group": student.group,
        "year": student.year,
        "is_headman": getattr(student, 'is_headman', False),
        "hash_id": get_student_hash(student.id)
    }
    
    return StudentStats(
        student=StudentResponse(**student_dict),
        gpa=round(gpa, 2),
        total_grades=total_grades,
        attendance_rate=round(attendance_rate, 2),
        achievements_count=achievements_count,
        burnout_risk=prediction.burnout_risk if prediction else None,
        success_probability=prediction.success_probability if prediction else None,
        predicted_gpa=prediction.predicted_gpa if prediction else None,
        rank=rank,
        total_students=total_students
    )


@app.get("/api/students/bulk-stats")
async def get_students_bulk_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Оптимизированное получение статистики всех студентов одним запросом (GPA и посещаемость)"""
    if current_user.role not in ["admin", "teacher"]:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    # Подзапрос для GPA студентов
    gpa_subquery = db.query(
        Student.id.label('student_id'),
        func.avg(Grade.value).label('gpa')
    ).join(
        Grade, Student.id == Grade.student_id
    ).group_by(
        Student.id
    ).subquery()
    
    # Подзапрос для посещаемости студентов
    attendance_subquery = db.query(
        Student.id.label('student_id'),
        func.sum(case((Attendance.present == True, 1), else_=0)).label('present_count'),
        func.count(Attendance.id).label('total_count')
    ).join(
        Attendance, Student.id == Attendance.student_id
    ).filter(
        Attendance.date >= date.today() - timedelta(days=60)
    ).group_by(
        Student.id
    ).subquery()
    
    # Объединяем все данные
    result = db.query(
        Student.id,
        gpa_subquery.c.gpa,
        attendance_subquery.c.present_count,
        attendance_subquery.c.total_count
    ).outerjoin(
        gpa_subquery, Student.id == gpa_subquery.c.student_id
    ).outerjoin(
        attendance_subquery, Student.id == attendance_subquery.c.student_id
    ).all()
    
    # Формируем результат
    # Получаем посещаемость сегодня для всех студентов одним запросом
    today = date.today()
    today_attendance = db.query(Attendance.student_id).filter(
        Attendance.date == today,
        Attendance.present == True
    ).distinct().all()
    present_today_ids = {row[0] for row in today_attendance}
    
    students_stats = {}
    for row in result:
        student_id = row.id
        gpa = float(row.gpa) if row.gpa else 0.0
        attendance_rate = 0.0
        if row.total_count and row.total_count > 0:
            attendance_rate = (float(row.present_count) / float(row.total_count)) * 100
        
        students_stats[student_id] = {
            "gpa": round(gpa, 2),
            "attendance_rate": round(attendance_rate, 2),
            "present_today": student_id in present_today_ids
        }
    
    return students_stats


@app.get("/api/students/{student_id}/grades", response_model=List[GradeResponse])
async def get_student_grades(
    student_id: int,
    course_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получение оценок студента"""
    # Проверка прав доступа
    if not can_access_student(current_user, student_id, db):
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    query = db.query(Grade).filter(Grade.student_id == student_id)
    
    # Преподаватель видит только оценки по своим курсам
    if current_user.role == "teacher":
        teacher_courses = db.query(CourseTeacher.course_id).filter(
            CourseTeacher.teacher_id == current_user.teacher_id
        ).all()
        course_ids = [c[0] for c in teacher_courses]
        if course_ids:
            query = query.filter(Grade.course_id.in_(course_ids))
        else:
            query = query.filter(Grade.course_id == -1)
    
    if course_id:
        query = query.filter(Grade.course_id == course_id)
    
    grades = query.order_by(desc(Grade.date)).all()
    
    # Добавляем названия курсов
    result = []
    for grade in grades:
        course = db.query(Course).filter(Course.id == grade.course_id).first()
        grade_dict = {
            "id": grade.id,
            "student_id": grade.student_id,
            "course_id": grade.course_id,
            "value": grade.value,
            "type": grade.type,
            "date": grade.date,
            "course_name": course.name if course else None
        }
        result.append(GradeResponse(**grade_dict))
    
    return result


class HeadmanRequest(BaseModel):
    is_headman: bool = True

@app.put("/api/students/{student_id}/headman")
async def set_headman(
    student_id: int,
    request: HeadmanRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Назначение/снятие старосты группы (только для администратора)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещен: требуется роль администратора")
    
    # Получаем студента
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Студент не найден")
    
    if not student.group:
        raise HTTPException(status_code=400, detail="Студент не состоит в группе")
    
    # Если назначаем старосту, снимаем старосту с других студентов в этой группе
    if request.is_headman:
        # Снимаем старосту со всех студентов в этой группе
        db.query(Student).filter(
            Student.group == student.group,
            Student.id != student_id,
            Student.is_headman == True
        ).update({"is_headman": False})
    
    # Устанавливаем/снимаем старосту
    student.is_headman = request.is_headman
    db.commit()
    db.refresh(student)
    
    return {
        "message": f"Студент {'назначен' if request.is_headman else 'снят с должности'} старостой группы {student.group}",
        "student": {
            "id": student.id,
            "name": student.name,
            "group": student.group,
            "is_headman": student.is_headman
        }
    }


@app.get("/api/courses", response_model=List[CourseResponse])
async def get_courses(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получение списка курсов"""
    if current_user.role == "teacher":
        # Преподаватель видит только свои курсы
        teacher_courses = db.query(CourseTeacher.course_id).filter(
            CourseTeacher.teacher_id == current_user.teacher_id
        ).all()
        course_ids = [c[0] for c in teacher_courses]
        if course_ids:
            return db.query(Course).filter(Course.id.in_(course_ids)).all()
        else:
            return []
    return db.query(Course).all()


class TeacherResponse(BaseModel):
    id: int
    name: str
    email: str
    department: Optional[str] = None

    class Config:
        from_attributes = True


@app.get("/api/teachers", response_model=List[TeacherResponse])
async def get_teachers(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получение списка преподавателей"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещен: требуется роль администратора")
    
    teachers = db.query(Teacher).all()
    return teachers


@app.get("/api/groups/bulk-stats")
async def get_groups_bulk_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Оптимизированное получение статистики всех групп одним запросом"""
    if current_user.role not in ["admin", "teacher"]:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    # Оптимизированный запрос: получаем статистику всех групп одним запросом
    # Используем агрегацию на уровне SQL для максимальной производительности
    
    # Получаем все группы с их статистикой одним запросом
    groups_with_stats = db.query(
        Student.group,
        func.count(func.distinct(Student.id)).label('student_count'),
        func.avg(Grade.value).label('avg_gpa'),
        func.sum(case((Attendance.present == True, 1), else_=0)).label('present_count'),
        func.count(Attendance.id).label('total_count')
    ).outerjoin(
        Grade, Student.id == Grade.student_id
    ).outerjoin(
        Attendance, and_(
            Student.id == Attendance.student_id,
            Attendance.date >= date.today() - timedelta(days=60)
        )
    ).filter(
        Student.group.isnot(None)
    ).group_by(
        Student.group
    ).all()
    
    # Формируем результат
    groups_stats = {}
    for row in groups_with_stats:
        group_name = row.group
        if not group_name:
            continue
            
        avg_gpa = float(row.avg_gpa) if row.avg_gpa else 0.0
        attendance_rate = 0.0
        if row.total_count and row.total_count > 0:
            attendance_rate = (float(row.present_count) / float(row.total_count)) * 100
        
        groups_stats[group_name] = {
            "average_gpa": round(avg_gpa, 2),
            "attendance_rate": round(attendance_rate, 2),
            "total_students": row.student_count
        }
    
    return groups_stats


@app.get("/api/groups/{group_name}/stats")
async def get_group_stats(
    group_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получение статистики группы"""
    # Декодируем название группы
    group_name = group_name.replace('_', '-')
    
    # Проверяем права доступа
    if current_user.role == "student":
        # Студент может видеть статистику только своей группы, если он староста
        if not current_user.student_id:
            raise HTTPException(status_code=403, detail="Доступ запрещен")
        
        student = db.query(Student).filter(Student.id == current_user.student_id).first()
        if not student or not student.is_headman or student.group != group_name:
            raise HTTPException(status_code=403, detail="Доступ запрещен. Только староста может просматривать статистику своей группы")
    elif current_user.role not in ["admin", "teacher"]:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    # Получаем студентов группы
    students = db.query(Student).filter(Student.group == group_name).all()
    
    if not students:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    
    student_ids = [s.id for s in students]
    
    # Вычисляем средний GPA
    avg_grade_query = db.query(func.avg(Grade.value)).filter(
        Grade.student_id.in_(student_ids)
    )
    avg_gpa = avg_grade_query.scalar() or 0.0
    
    # Вычисляем посещаемость за последние 30 дней
    total_attendance = db.query(Attendance.id).filter(
        Attendance.student_id.in_(student_ids),
        Attendance.date >= date.today() - timedelta(days=30)
    ).count()
    
    present_attendance = db.query(Attendance.id).filter(
        Attendance.student_id.in_(student_ids),
        Attendance.date >= date.today() - timedelta(days=30),
        Attendance.present == True
    ).count()
    
    attendance_rate = (present_attendance / total_attendance * 100) if total_attendance > 0 else 0.0
    
    # Получаем курсы группы через оценки студентов
    courses_with_grades = db.query(Grade.course_id).filter(
        Grade.student_id.in_(student_ids)
    ).distinct().all()
    course_ids = [c[0] for c in courses_with_grades]
    
    # Получаем курсы с преподавателями
    courses_info = []
    if course_ids:
        # Получаем уникальные комбинации курс-преподаватель через CourseTeacher
        course_teachers = db.query(CourseTeacher).filter(
            CourseTeacher.course_id.in_(course_ids)
        ).all()
        
        # Группируем по курсам
        courses_dict = {}
        for ct in course_teachers:
            course_id = ct.course_id
            teacher_id = ct.teacher_id
            
            if course_id not in courses_dict:
                course = db.query(Course).filter(Course.id == course_id).first()
                if course:
                    courses_dict[course_id] = {
                        "course_id": course.id,
                        "course_name": course.name,
                        "course_code": course.code,
                        "teachers": []
                    }
            
            teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
            if teacher:
                # Вычисляем статистику для этого курса и преподавателя
                # Оценки студентов группы по этому курсу
                course_grades = db.query(Grade.value).filter(
                    Grade.student_id.in_(student_ids),
                    Grade.course_id == course_id
                ).all()
                course_avg = sum([g[0] for g in course_grades]) / len(course_grades) if course_grades else 0.0
                
                # Посещаемость по этому курсу
                course_attendance = db.query(Attendance.id).filter(
                    Attendance.student_id.in_(student_ids),
                    Attendance.course_id == course_id,
                    Attendance.date >= date.today() - timedelta(days=30)
                ).count()
                course_present = db.query(Attendance.id).filter(
                    Attendance.student_id.in_(student_ids),
                    Attendance.course_id == course_id,
                    Attendance.date >= date.today() - timedelta(days=30),
                    Attendance.present == True
                ).count()
                course_attendance_rate = (course_present / course_attendance * 100) if course_attendance > 0 else 0.0
                
                courses_dict[course_id]["teachers"].append({
                    "teacher_id": teacher.id,
                    "teacher_name": teacher.name,
                    "teacher_email": teacher.email,
                    "average_grade": round(course_avg, 2),
                    "attendance_rate": round(course_attendance_rate, 2)
                })
        
        courses_info = list(courses_dict.values())
    
    # Проверяем посещаемость сегодня для каждого студента
    today = date.today()
    students_with_attendance = []
    for s in students:
        # Проверяем, был ли студент сегодня в университете (любая запись с present=True)
        today_attendance = db.query(Attendance).filter(
            Attendance.student_id == s.id,
            Attendance.date == today,
            Attendance.present == True
        ).first()
        is_present_today = today_attendance is not None
        
        students_with_attendance.append({
            "id": s.id,
            "name": s.name,
            "email": s.email,
            "is_headman": getattr(s, 'is_headman', False),
            "hash_id": get_student_hash(s.id),
            "present_today": is_present_today
        })
    
    return {
        "group": group_name,
        "total_students": len(students),
        "average_gpa": round(avg_gpa, 2),
        "attendance_rate": round(attendance_rate, 2),
        "students": students_with_attendance,
        "courses": courses_info
    }


@app.get("/api/teachers/{teacher_id}/stats")
async def get_teacher_stats(
    teacher_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получение статистики преподавателя"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещен: требуется роль администратора")
    
    teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Преподаватель не найден")
    
    # Получаем курсы преподавателя
    teacher_courses = db.query(CourseTeacher.course_id).filter(
        CourseTeacher.teacher_id == teacher_id
    ).all()
    course_ids = [c[0] for c in teacher_courses]
    
    # Получаем студентов преподавателя
    student_ids = []
    if course_ids:
        student_ids_query = db.query(Grade.student_id).filter(
            Grade.course_id.in_(course_ids)
        ).distinct().all()
        student_ids = [s[0] for s in student_ids_query]
    
    # Статистика
    total_courses = len(course_ids)
    total_students = len(student_ids)
    
    # Средний балл по всем курсам преподавателя
    avg_grade = 0.0
    if course_ids:
        avg_grade_query = db.query(func.avg(Grade.value)).filter(
            Grade.course_id.in_(course_ids)
        )
        avg_grade = avg_grade_query.scalar() or 0.0
    
    # Посещаемость
    attendance_rate = 0.0
    if student_ids:
        total_attendance = db.query(Attendance.id).filter(
            Attendance.student_id.in_(student_ids),
            Attendance.date >= date.today() - timedelta(days=30)
        ).count()
        present_attendance = db.query(Attendance.id).filter(
            Attendance.student_id.in_(student_ids),
            Attendance.date >= date.today() - timedelta(days=30),
            Attendance.present == True
        ).count()
        attendance_rate = (present_attendance / total_attendance * 100) if total_attendance > 0 else 0.0
    
    # Получаем группы студентов
    groups = []
    if student_ids:
        groups_query = db.query(Student.group).filter(
            Student.id.in_(student_ids)
        ).distinct().all()
        groups = [g[0] for g in groups_query if g[0]]
    
    return {
        "teacher": teacher,
        "total_courses": total_courses,
        "total_students": total_students,
        "average_grade": round(avg_grade, 2),
        "attendance_rate": round(attendance_rate, 2),
        "groups": groups,
        "course_ids": course_ids
    }


@app.get("/api/courses/{course_id}/stats")
async def get_course_stats(
    course_id: int,
    group: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Статистика по курсу"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")
    
    # Проверка прав доступа для преподавателя
    if current_user.role == "teacher":
        teacher_course = db.query(CourseTeacher).filter(
            CourseTeacher.course_id == course_id,
            CourseTeacher.teacher_id == current_user.teacher_id
        ).first()
        if not teacher_course:
            raise HTTPException(status_code=403, detail="Доступ запрещен: это не ваш курс")
    
    # Фильтр по студентам
    student_filter = None
    if current_user.role == "teacher":
        # Только студенты преподавателя
        teacher_courses = db.query(CourseTeacher.course_id).filter(
            CourseTeacher.teacher_id == current_user.teacher_id
        ).all()
        course_ids = [c[0] for c in teacher_courses]
        if course_ids:
            student_ids = db.query(Grade.student_id).filter(
                Grade.course_id.in_(course_ids)
            ).distinct().all()
            student_ids = [s[0] for s in student_ids]
            if student_ids:
                student_filter = Student.id.in_(student_ids)
            else:
                student_filter = Student.id == -1
        else:
            student_filter = Student.id == -1
    
    # Фильтр по группе
    if group:
        group_filter = Student.group == group
        if student_filter is not None:
            student_filter = and_(student_filter, group_filter)
        else:
            student_filter = group_filter
    
    # Запрос оценок с фильтрами
    query_grades = db.query(Grade).filter(Grade.course_id == course_id)
    if student_filter is not None:
        student_ids = db.query(Student.id).filter(student_filter).all()
        student_ids = [s[0] for s in student_ids]
        if student_ids:
            query_grades = query_grades.filter(Grade.student_id.in_(student_ids))
        else:
            query_grades = query_grades.filter(Grade.student_id == -1)
    
    avg_grade = query_grades.with_entities(func.avg(Grade.value)).scalar() or 0.0
    
    total_students = query_grades.with_entities(
        func.count(func.distinct(Grade.student_id))
    ).scalar() or 0
    
    # Посещаемость с фильтрами
    query_attendance = db.query(Attendance).filter(
        Attendance.course_id == course_id,
        Attendance.date >= date.today() - timedelta(days=30)
    )
    if student_filter is not None:
        student_ids = db.query(Student.id).filter(student_filter).all()
        student_ids = [s[0] for s in student_ids]
        if student_ids:
            query_attendance = query_attendance.filter(Attendance.student_id.in_(student_ids))
        else:
            query_attendance = query_attendance.filter(Attendance.student_id == -1)
    
    attendance_rate = query_attendance.with_entities(
        func.avg(func.cast(Attendance.present, Integer))
    ).scalar() or 0.0
    
    # Получаем преподавателей курса
    course_teachers = db.query(CourseTeacher).filter(
        CourseTeacher.course_id == course_id
    ).all()
    teacher_ids = [ct.teacher_id for ct in course_teachers]
    teachers = []
    if teacher_ids:
        teachers_query = db.query(Teacher).filter(Teacher.id.in_(teacher_ids)).all()
        teachers = [
            {
                "id": t.id,
                "name": t.name,
                "email": t.email,
                "department": t.department
            }
            for t in teachers_query
        ]
    
    result = {
        "course": course,
        "average_grade": round(avg_grade, 2),
        "total_students": total_students,
        "attendance_rate": round(attendance_rate * 100, 2),
        "teachers": teachers
    }
    
    # Для админа: получаем статистику по всем группам, сгруппированную по преподавателям
    if current_user.role == "admin":
        # Получаем все группы, которые изучают этот курс
        groups_with_students = db.query(
            Student.group,
            func.count(func.distinct(Student.id)).label('student_count')
        ).join(
            Grade, Student.id == Grade.student_id
        ).filter(
            Grade.course_id == course_id
        ).group_by(Student.group).all()
        
        # Для каждой группы определяем преподавателя и собираем статистику
        groups_by_teacher = {}  # {teacher_id: {teacher_info, groups: [{group, stats}]}}
        
        # Определяем преподавателя текущей группы (если есть фильтр)
        current_teacher_id = None
        if group:
            # Находим преподавателя, который поставил больше всего оценок студентам этой группы
            teacher_grade_counts = db.query(
                CourseTeacher.teacher_id,
                func.count(Grade.id).label('grade_count')
            ).join(
                Grade, Grade.course_id == CourseTeacher.course_id
            ).join(
                Student, Student.id == Grade.student_id
            ).filter(
                CourseTeacher.course_id == course_id,
                Student.group == group
            ).group_by(CourseTeacher.teacher_id).order_by(desc('grade_count')).first()
            
            if teacher_grade_counts:
                current_teacher_id = teacher_grade_counts[0]
        
        for group_name, student_count in groups_with_students:
            if not group_name:
                continue
                
            # Определяем преподавателя для этой группы
            # Берем преподавателя, который поставил больше всего оценок студентам этой группы
            teacher_for_group = db.query(
                CourseTeacher.teacher_id,
                func.count(Grade.id).label('grade_count')
            ).join(
                Grade, Grade.course_id == CourseTeacher.course_id
            ).join(
                Student, Student.id == Grade.student_id
            ).filter(
                CourseTeacher.course_id == course_id,
                Student.group == group_name
            ).group_by(CourseTeacher.teacher_id).order_by(desc('grade_count')).first()
            
            teacher_id = teacher_for_group[0] if teacher_for_group else (teacher_ids[0] if teacher_ids else None)
            
            if not teacher_id:
                continue
            
            # Получаем статистику для этой группы
            group_students = db.query(Student.id).filter(Student.group == group_name).all()
            group_student_ids = [s[0] for s in group_students]
            
            if not group_student_ids:
                continue
            
            # Оценки группы
            group_grades = db.query(Grade).filter(
                Grade.course_id == course_id,
                Grade.student_id.in_(group_student_ids)
            )
            group_avg_grade = group_grades.with_entities(func.avg(Grade.value)).scalar() or 0.0
            group_total_students = group_grades.with_entities(
                func.count(func.distinct(Grade.student_id))
            ).scalar() or 0
            
            # Посещаемость группы
            group_attendance = db.query(Attendance).filter(
                Attendance.course_id == course_id,
                Attendance.student_id.in_(group_student_ids),
                Attendance.date >= date.today() - timedelta(days=30)
            )
            group_attendance_rate = group_attendance.with_entities(
                func.avg(func.cast(Attendance.present, Integer))
            ).scalar() or 0.0
            
            # Добавляем в структуру
            if teacher_id not in groups_by_teacher:
                teacher_info = db.query(Teacher).filter(Teacher.id == teacher_id).first()
                if not teacher_info:
                    continue
                groups_by_teacher[teacher_id] = {
                    "teacher": {
                        "id": teacher_info.id,
                        "name": teacher_info.name,
                        "email": teacher_info.email,
                        "department": teacher_info.department
                    },
                    "groups": []
                }
            
            groups_by_teacher[teacher_id]["groups"].append({
                "group": group_name,
                "average_grade": round(group_avg_grade, 2),
                "total_students": group_total_students,
                "attendance_rate": round(group_attendance_rate * 100, 2)
            })
        
        # Сортируем: сначала текущий преподаватель (если есть фильтр), потом остальные
        teachers_with_groups = []
        if current_teacher_id and current_teacher_id in groups_by_teacher:
            teachers_with_groups.append(groups_by_teacher[current_teacher_id])
            del groups_by_teacher[current_teacher_id]
        
        # Добавляем остальных преподавателей
        for teacher_id, data in groups_by_teacher.items():
            teachers_with_groups.append(data)
        
        result["teachers_with_groups"] = teachers_with_groups
    
    return result


@app.get("/api/activity/timeline")
async def get_activity_timeline(
    days: int = 30,
    groups: Optional[str] = None,
    department: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получение временной линии активности (LMS активность убрана)"""
    # Возвращаем пустой массив для обратной совместимости
    return {
        "lms_activity": []
    }


@app.get("/api/leaderboard")
async def get_leaderboard(
    limit: int = 10,
    group: Optional[str] = None,
    department: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Рейтинг студентов по GPA"""
    query = db.query(
        Student.id,
        Student.name,
        Student.group,
        func.avg(Grade.value).label('gpa')
    ).join(
        Grade, Student.id == Grade.student_id
    )
    
    # Фильтры по роли
    if current_user.role == "teacher":
        teacher_courses = db.query(CourseTeacher.course_id).filter(
            CourseTeacher.teacher_id == current_user.teacher_id
        ).all()
        course_ids = [c[0] for c in teacher_courses]
        if course_ids:
            query = query.filter(Grade.course_id.in_(course_ids))
        else:
            query = query.filter(Grade.course_id == -1)
    
    # Фильтр по группе (может быть несколько групп через запятую)
    if group:
        groups_list = [g.strip() for g in group.split(',') if g.strip()]
        if groups_list:
            query = query.filter(Student.group.in_(groups_list))
    
    # Фильтр по кафедре
    if department:
        if department == 'ИТ':
            query = query.filter(Student.group.like('ИТ-%'))
        elif department == 'ПИ':
            query = query.filter(Student.group.like('ПИ-%'))
    
    # Если limit очень большой (>= 1000), возвращаем всех студентов без фильтра по количеству оценок
    if limit >= 1000:
        leaderboard = query.group_by(
            Student.id, Student.name, Student.group
        ).order_by(
            desc('gpa')
        ).all()
    else:
        leaderboard = query.group_by(
            Student.id, Student.name, Student.group
        ).having(
            func.count(Grade.id) >= 5
        ).order_by(
            desc('gpa')
        ).limit(limit).all()
    
    return [
        {
            "student_id": s.id,
            "name": s.name,
            "group": s.group,
            "gpa": round(s.gpa, 2),
            "hash_id": get_student_hash(s.id)
        }
        for s in leaderboard
    ]


@app.get("/api/achievements/{student_id}")
async def get_student_achievements(
    student_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получение достижений студента"""
    # Проверка прав доступа
    if not can_access_student(current_user, student_id, db):
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    # Администратор не видит достижения (но может через другой endpoint)
    if current_user.role == "admin":
        raise HTTPException(status_code=403, detail="Администратор не может просматривать достижения")
    
    # Проверяем, есть ли новая структура
    try:
        db.execute(text("SELECT id FROM achievement_templates LIMIT 1"))
        has_new_structure = True
    except OperationalError:
        has_new_structure = False
    
    # Если новая структура доступна, используем её
    if has_new_structure:
        return await get_student_achievements_new(student_id, current_user, db)
    
    # Проверяем, существует ли колонка course_id
    has_course_id_column = True
    try:
        # Пробуем запросить с course_id
        achievements_query = db.query(
            Achievement.id,
            Achievement.student_id,
            Achievement.course_id,
            Achievement.name,
            Achievement.description,
            Achievement.icon,
            Achievement.points,
            Achievement.unlocked_at
        ).filter(
            Achievement.student_id == student_id
        )
        achievements_tuples = achievements_query.order_by(desc(Achievement.unlocked_at)).all()
    except OperationalError as e:
        if 'no such column: achievements.course_id' in str(e):
            # Колонка не существует, запрашиваем без course_id
            has_course_id_column = False
            achievements_query = db.query(
                Achievement.id,
                Achievement.student_id,
                Achievement.name,
                Achievement.description,
                Achievement.icon,
                Achievement.points,
                Achievement.unlocked_at
            ).filter(
                Achievement.student_id == student_id
            )
            achievements_tuples = achievements_query.order_by(desc(Achievement.unlocked_at)).all()
        else:
            raise
    
    # Преобразуем кортежи в словари
    achievements_with_course = []
    for ach_tuple in achievements_tuples:
        if has_course_id_column:
            ach_id, ach_student_id, ach_course_id, name, description, icon, points, unlocked_at = ach_tuple
        else:
            ach_id, ach_student_id, name, description, icon, points, unlocked_at = ach_tuple
            ach_course_id = None
        
        ach_dict = {
            "id": ach_id,
            "student_id": ach_student_id,
            "name": name,
            "description": description,
            "icon": icon,
            "points": points,
            "unlocked_at": str(unlocked_at) if unlocked_at else None,
            "course_id": ach_course_id,
            "course_name": None
        }
        
        # Если есть course_id, получаем название курса
        if ach_dict["course_id"]:
            course = db.query(Course).filter(Course.id == ach_dict["course_id"]).first()
            if course:
                ach_dict["course_name"] = course.name
        
        achievements_with_course.append(ach_dict)
    
    total_points = sum(ach["points"] for ach in achievements_with_course if ach["unlocked_at"])
    
    return {
        "achievements": achievements_with_course,
        "total_points": total_points
    }


# Управление достижениями

class AchievementCreate(BaseModel):
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    points: int = 0
    course_id: Optional[int] = None  # None для общих достижений
    is_public: Optional[bool] = False  # True - достижение "для всех", может выдавать кто угодно


class AchievementAssign(BaseModel):
    achievement_id: int
    student_ids: Optional[List[int]] = None  # Конкретные студенты
    group: Optional[str] = None  # Вся группа
    department: Optional[str] = None  # Вся кафедра
    course_id: Optional[int] = None  # Все студенты курса
    all_students: bool = False  # Всем студентам


@app.get("/api/achievements")
async def get_all_achievements(
    course_id: Optional[int] = None,
    include_deleted: bool = False,  # Показывать удаленные достижения
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получение всех достижений (для учителя - по своим курсам, для админа - все)"""
    
    # Проверяем, есть ли новая структура
    try:
        db.execute(text("SELECT id FROM achievement_templates LIMIT 1"))
        has_new_structure = True
    except OperationalError:
        has_new_structure = False
    
    # Если новая структура доступна, используем её
    if has_new_structure:
        return await get_all_achievements_new(course_id, include_deleted, current_user, db)
    
    # Иначе используем старую логику для обратной совместимости
    # Проверяем существование колонки deleted
    has_deleted_column = True
    try:
        db.execute(text("SELECT deleted FROM achievements LIMIT 1"))
    except OperationalError:
        has_deleted_column = False
    
    # Сначала пробуем получить все достижения без фильтров по course_id
    # Используем явный выбор колонок, чтобы избежать ошибок с несуществующими колонками
    try:
        # Пробуем запросить с course_id и deleted
        if has_deleted_column:
            base_query = db.query(
                Achievement.id,
                Achievement.student_id,
                Achievement.course_id,
                Achievement.name,
                Achievement.description,
                Achievement.icon,
                Achievement.points,
                Achievement.unlocked_at,
                Achievement.deleted
            )
        else:
            base_query = db.query(
                Achievement.id,
                Achievement.student_id,
                Achievement.course_id,
                Achievement.name,
                Achievement.description,
                Achievement.icon,
                Achievement.points,
                Achievement.unlocked_at
            )
        
        # Применяем фильтры
        if current_user.role == "teacher":
            # Учитель видит только достижения по своим курсам
            teacher_courses = db.query(CourseTeacher.course_id).filter(
                CourseTeacher.teacher_id == current_user.teacher_id
            ).all()
            course_ids = [c[0] for c in teacher_courses]
            if course_ids:
                # Показываем только достижения по курсам преподавателя (не общие)
                base_query = base_query.filter(Achievement.course_id.in_(course_ids))
            else:
                # Если у преподавателя нет курсов, не показываем достижения
                base_query = base_query.filter(Achievement.course_id == -1)  # Невозможное значение
        
        if course_id:
            base_query = base_query.filter(Achievement.course_id == course_id)
        
        # Фильтруем удаленные, если не запрошены явно
        if has_deleted_column and not include_deleted:
            base_query = base_query.filter(Achievement.deleted == False)
        
        achievements_tuples = base_query.distinct().all()
        has_course_id_column = True
    except OperationalError as e:
        if 'no such column: achievements.course_id' in str(e) or 'no such column: course_id' in str(e):
            # Колонка не существует, запрашиваем без course_id
            has_course_id_column = False
            if has_deleted_column:
                base_query = db.query(
                    Achievement.id,
                    Achievement.student_id,
                    Achievement.name,
                    Achievement.description,
                    Achievement.icon,
                    Achievement.points,
                    Achievement.unlocked_at,
                    Achievement.deleted
                )
            else:
                base_query = db.query(
                    Achievement.id,
                    Achievement.student_id,
                    Achievement.name,
                    Achievement.description,
                    Achievement.icon,
                    Achievement.points,
                    Achievement.unlocked_at
                )
            
            # Применяем фильтры для случая без course_id
            if current_user.role == "teacher":
                # Для учителя без course_id показываем только общие достижения
                # (но так как course_id нет, фильтровать не можем, поэтому показываем все)
                pass
            
            if course_id:
                # Если запрошен конкретный курс, но колонки нет - возвращаем пустой список
                achievements_tuples = []
            else:
                # Фильтруем удаленные, если не запрошены явно
                if has_deleted_column and not include_deleted:
                    base_query = base_query.filter(Achievement.deleted == False)
                achievements_tuples = base_query.distinct().all()
        else:
            raise
    
    # Преобразуем кортежи в словари
    achievements = []
    for ach_tuple in achievements_tuples:
        # Определяем количество элементов в кортеже
        tuple_len = len(ach_tuple)
        
        if has_course_id_column:
            # С course_id: id, student_id, course_id, name, description, icon, points, unlocked_at [, deleted]
            if has_deleted_column and tuple_len == 9:
                ach_id, student_id, ach_course_id, name, description, icon, points, unlocked_at, deleted = ach_tuple
            elif tuple_len == 8:
                ach_id, student_id, ach_course_id, name, description, icon, points, unlocked_at = ach_tuple
                deleted = False
            else:
                # Fallback на случай неожиданного формата
                ach_id, student_id, ach_course_id, name, description, icon, points, unlocked_at = ach_tuple[:8]
                deleted = False
        else:
            # Без course_id: id, student_id, name, description, icon, points, unlocked_at [, deleted]
            if has_deleted_column and tuple_len == 8:
                ach_id, student_id, name, description, icon, points, unlocked_at, deleted = ach_tuple
                ach_course_id = None
            elif tuple_len == 7:
                ach_id, student_id, name, description, icon, points, unlocked_at = ach_tuple
                ach_course_id = None
                deleted = False
            else:
                # Fallback
                ach_id, student_id, name, description, icon, points, unlocked_at = ach_tuple[:7]
                ach_course_id = None
                deleted = False
        
        achievements.append({
            "id": ach_id,
            "student_id": student_id,
            "course_id": ach_course_id,
            "name": name,
            "description": description,
            "icon": icon,
            "points": points,
            "unlocked_at": unlocked_at,
            "deleted": deleted if has_deleted_column else False
        })
    
    # Группируем по уникальным названиям (шаблоны достижений)
    achievement_templates = {}
    for ach in achievements:
        ach_course_id = ach.get("course_id")
        deleted = ach.get("deleted", False)
        key = (ach["name"], ach_course_id)
        if key not in achievement_templates:
            achievement_templates[key] = {
                "id": ach["id"],
                "name": ach["name"],
                "description": ach["description"],
                "icon": ach["icon"],
                "points": ach["points"],
                "course_id": ach_course_id,
                "course_name": None,
                "total_earned": 0,
                "deleted": deleted
            }
            if achievement_templates[key]["course_id"]:
                course = db.query(Course).filter(Course.id == achievement_templates[key]["course_id"]).first()
                if course:
                    achievement_templates[key]["course_name"] = course.name
        else:
            # Если шаблон уже существует, обновляем статус deleted
            # Если хотя бы одно достижение удалено, шаблон считается удаленным
            if deleted:
                achievement_templates[key]["deleted"] = True
        # Учитываем только неудаленные достижения при подсчете
        if not deleted:
            achievement_templates[key]["total_earned"] += 1
    
    return list(achievement_templates.values())


@app.post("/api/achievements")
async def create_achievement(
    achievement_data: AchievementCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Создание нового достижения (только для учителя и админа)"""
    if current_user.role not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    # Проверка для учителя: курс должен быть его
    if achievement_data.course_id and current_user.role == "teacher":
        teacher_course = db.query(CourseTeacher).filter(
            CourseTeacher.course_id == achievement_data.course_id,
            CourseTeacher.teacher_id == current_user.teacher_id
        ).first()
        if not teacher_course:
            raise HTTPException(status_code=403, detail="Доступ запрещен: это не ваш курс")
    
    # Проверяем, есть ли новая структура
    try:
        db.execute(text("SELECT id FROM achievement_templates LIMIT 1"))
        has_new_structure = True
    except OperationalError:
        has_new_structure = False
    
    # Используем новую структуру если доступна
    if has_new_structure:
        return await create_achievement_template_new(
            achievement_data.name,
            achievement_data.description,
            achievement_data.icon,
            achievement_data.points,
            achievement_data.course_id,
            achievement_data.is_public,
            current_user,
            db
        )
    
    # Старая логика для обратной совместимости
    # Проверяем, существует ли колонка course_id
    has_course_id_column = True
    try:
        db.execute(text("SELECT course_id FROM achievements LIMIT 1"))
    except OperationalError:
        has_course_id_column = False
    
    # Создаем шаблон достижения (без student_id, это будет шаблон)
    if has_course_id_column:
        achievement = Achievement(
            student_id=None,  # Шаблон, не привязан к студенту
            course_id=achievement_data.course_id,
            name=achievement_data.name,
            description=achievement_data.description,
            icon=achievement_data.icon or "🏆",
            points=achievement_data.points
        )
    else:
        # Если колонки нет, используем raw SQL для вставки
        result = db.execute(
            text("""
                INSERT INTO achievements (student_id, name, description, icon, points, unlocked_at)
                VALUES (:student_id, :name, :description, :icon, :points, NULL)
            """),
            {
                "student_id": None,
                "name": achievement_data.name,
                "description": achievement_data.description,
                "icon": achievement_data.icon or "🏆",
                "points": achievement_data.points
            }
        )
        db.commit()
        # Получаем созданное достижение
        achievement_id = result.lastrowid
        achievement_result = db.execute(
            text("SELECT id, student_id, name, description, icon, points, unlocked_at FROM achievements WHERE id = :id"),
            {"id": achievement_id}
        )
        ach_row = achievement_result.fetchone()
        
        return {
            "id": ach_row[0],
            "name": ach_row[2],
            "description": ach_row[3],
            "icon": ach_row[4],
            "points": ach_row[5],
            "course_id": None
        }
    
    db.add(achievement)
    db.commit()
    db.refresh(achievement)
    
    return {
        "id": achievement.id,
        "name": achievement.name,
        "description": achievement.description,
        "icon": achievement.icon,
        "points": achievement.points,
        "course_id": getattr(achievement, 'course_id', None) if has_course_id_column else None
    }


@app.post("/api/achievements/assign")
async def assign_achievement(
    assign_data: AchievementAssign,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Выдача достижения студентам"""
    if current_user.role not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    # Проверяем, есть ли новая структура
    try:
        db.execute(text("SELECT id FROM achievement_templates LIMIT 1"))
        has_new_structure = True
    except OperationalError:
        has_new_structure = False
    
    if has_new_structure:
        # Используем новую структуру
        template = db.query(AchievementTemplate).filter(
            AchievementTemplate.id == assign_data.achievement_id
        ).first()
        
        if not template:
            raise HTTPException(status_code=404, detail="Достижение не найдено")
        
        if template.deleted:
            raise HTTPException(status_code=400, detail="Нельзя выдать удаленное достижение")
        
        # Проверка прав для учителя
        if current_user.role == "teacher":
            # Преподаватель может выдавать:
            # 1. Публичные достижения (is_public=True) - любые
            # 2. Достижения по своим курсам (course_id принадлежит преподавателю)
            is_public = getattr(template, 'is_public', False)
            if is_public:
                # Публичное достижение - можно выдавать
                pass
            elif template.course_id:
                # Проверяем, что курс принадлежит преподавателю
                teacher_course = db.query(CourseTeacher).filter(
                    CourseTeacher.course_id == template.course_id,
                    CourseTeacher.teacher_id == current_user.teacher_id
                ).first()
                if not teacher_course:
                    raise HTTPException(status_code=403, detail="Доступ запрещен: это не ваш курс")
            else:
                # Обычное общее достижение (не публичное) - нельзя выдавать
                raise HTTPException(status_code=403, detail="Доступ запрещен: вы можете выдавать только достижения по вашим курсам или публичные достижения")
        
        # Определяем список студентов для выдачи (та же логика что и раньше)
        student_ids = []
        
        if assign_data.all_students:
            if current_user.role == "admin":
                students = db.query(Student).all()
                student_ids = [s.id for s in students]
            else:
                teacher_courses = db.query(CourseTeacher.course_id).filter(
                    CourseTeacher.teacher_id == current_user.teacher_id
                ).all()
                course_ids = [c[0] for c in teacher_courses]
                if course_ids:
                    grade_students = db.query(Grade.student_id).filter(
                        Grade.course_id.in_(course_ids)
                    ).distinct().all()
                    student_ids = [s[0] for s in grade_students]
        elif assign_data.student_ids:
            # Для преподавателя проверяем, что все студенты учатся на его курсах
            if current_user.role == "teacher":
                # Получаем курсы преподавателя
                teacher_courses = db.query(CourseTeacher.course_id).filter(
                    CourseTeacher.teacher_id == current_user.teacher_id
                ).all()
                course_ids = [c[0] for c in teacher_courses]
                
                if not course_ids:
                    raise HTTPException(status_code=403, detail="У вас нет курсов для выдачи достижений")
                
                # Проверяем, что все выбранные студенты учатся на курсах преподавателя
                # Получаем студентов, которые имеют оценки по курсам преподавателя
                valid_students = db.query(Grade.student_id).filter(
                    Grade.course_id.in_(course_ids),
                    Grade.student_id.in_(assign_data.student_ids)
                ).distinct().all()
                valid_student_ids = [s[0] for s in valid_students]
                
                # Проверяем, что все выбранные студенты валидны
                invalid_students = set(assign_data.student_ids) - set(valid_student_ids)
                if invalid_students:
                    raise HTTPException(
                        status_code=403, 
                        detail=f"Вы не можете выдать достижение студентам, у которых не ведете предметы. Невалидные студенты: {len(invalid_students)}"
                    )
                
                student_ids = assign_data.student_ids
            else:
                student_ids = assign_data.student_ids
        elif assign_data.group:
            if current_user.role == "teacher":
                # Для преподавателя проверяем, что студенты группы учатся на его курсах
                teacher_courses = db.query(CourseTeacher.course_id).filter(
                    CourseTeacher.teacher_id == current_user.teacher_id
                ).all()
                course_ids = [c[0] for c in teacher_courses]
                
                if not course_ids:
                    raise HTTPException(status_code=403, detail="У вас нет курсов для выдачи достижений")
                
                # Получаем студентов группы, которые учатся на курсах преподавателя
                group_students = db.query(Student.id).filter(
                    Student.group == assign_data.group
                ).all()
                group_student_ids = [s[0] for s in group_students]
                
                if not group_student_ids:
                    raise HTTPException(status_code=400, detail="В группе нет студентов")
                
                # Проверяем, что студенты группы учатся на курсах преподавателя
                valid_students = db.query(Grade.student_id).filter(
                    Grade.course_id.in_(course_ids),
                    Grade.student_id.in_(group_student_ids)
                ).distinct().all()
                student_ids = [s[0] for s in valid_students]
                
                if not student_ids:
                    raise HTTPException(status_code=403, detail="В этой группе нет студентов, у которых вы ведете предметы")
            else:
                students = db.query(Student).filter(Student.group == assign_data.group).all()
                student_ids = [s.id for s in students]
        elif assign_data.department:
            if current_user.role == "teacher":
                # Для преподавателя проверяем, что студенты кафедры учатся на его курсах
                teacher_courses = db.query(CourseTeacher.course_id).filter(
                    CourseTeacher.teacher_id == current_user.teacher_id
                ).all()
                course_ids = [c[0] for c in teacher_courses]
                
                if not course_ids:
                    raise HTTPException(status_code=403, detail="У вас нет курсов для выдачи достижений")
                
                # Получаем студентов кафедры
                if assign_data.department == "ИТ":
                    dept_students = db.query(Student.id).filter(Student.group.like("ИТ-%")).all()
                elif assign_data.department == "ПИ":
                    dept_students = db.query(Student.id).filter(Student.group.like("ПИ-%")).all()
                else:
                    dept_students = []
                
                dept_student_ids = [s[0] for s in dept_students]
                
                if not dept_student_ids:
                    raise HTTPException(status_code=400, detail="На кафедре нет студентов")
                
                # Проверяем, что студенты кафедры учатся на курсах преподавателя
                valid_students = db.query(Grade.student_id).filter(
                    Grade.course_id.in_(course_ids),
                    Grade.student_id.in_(dept_student_ids)
                ).distinct().all()
                student_ids = [s[0] for s in valid_students]
                
                if not student_ids:
                    raise HTTPException(status_code=403, detail="На этой кафедре нет студентов, у которых вы ведете предметы")
            else:
                if assign_data.department == "ИТ":
                    students = db.query(Student).filter(Student.group.like("ИТ-%")).all()
                elif assign_data.department == "ПИ":
                    students = db.query(Student).filter(Student.group.like("ПИ-%")).all()
                else:
                    students = []
                student_ids = [s.id for s in students]
        elif assign_data.course_id:
            # Если достижение привязано к курсу, проверяем совпадение
            if template.course_id and template.course_id != assign_data.course_id:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Достижение привязано к курсу {template.course_id}, но вы пытаетесь выдать его по курсу {assign_data.course_id}"
                )
            
            if current_user.role == "teacher":
                teacher_course = db.query(CourseTeacher).filter(
                    CourseTeacher.course_id == assign_data.course_id,
                    CourseTeacher.teacher_id == current_user.teacher_id
                ).first()
                if not teacher_course:
                    raise HTTPException(status_code=403, detail="Доступ запрещен: это не ваш курс")
            
            grade_students = db.query(Grade.student_id).filter(
                Grade.course_id == assign_data.course_id
            ).distinct().all()
            student_ids = [s[0] for s in grade_students]
        
        if not student_ids:
            raise HTTPException(status_code=400, detail="Не найдено студентов для выдачи достижения")
        
        # Выдаем достижение используя новую структуру
        return await assign_achievement_new(
            assign_data.achievement_id,
            student_ids,
            current_user,
            db
        )
    
    # Старая логика для обратной совместимости
    # Получаем шаблон достижения (используем явный выбор колонок)
    try:
        template_query = db.query(
            Achievement.id,
            Achievement.student_id,
            Achievement.course_id,
            Achievement.name,
            Achievement.description,
            Achievement.icon,
            Achievement.points
        ).filter(Achievement.id == assign_data.achievement_id).first()
        has_course_id_column = True
    except OperationalError as e:
        if 'no such column: achievements.course_id' in str(e):
            template_query = db.query(
                Achievement.id,
                Achievement.student_id,
                Achievement.name,
                Achievement.description,
                Achievement.icon,
                Achievement.points
            ).filter(Achievement.id == assign_data.achievement_id).first()
            has_course_id_column = False
        else:
            raise
    
    if not template_query:
        raise HTTPException(status_code=404, detail="Достижение не найдено")
    
    # Преобразуем кортеж в словарь
    if has_course_id_column:
        template_id, template_student_id, template_course_id, template_name, template_description, template_icon, template_points = template_query
    else:
        template_id, template_student_id, template_name, template_description, template_icon, template_points = template_query
        template_course_id = None
    
    template = {
        "id": template_id,
        "student_id": template_student_id,
        "course_id": template_course_id,
        "name": template_name,
        "description": template_description,
        "icon": template_icon,
        "points": template_points
    }
    
    # Определяем список студентов для выдачи
    student_ids = []
    
    if assign_data.all_students:
        if current_user.role == "admin":
            students = db.query(Student).all()
            student_ids = [s.id for s in students]
        else:
            # Учитель может выдать только своим студентам
            teacher_courses = db.query(CourseTeacher.course_id).filter(
                CourseTeacher.teacher_id == current_user.teacher_id
            ).all()
            course_ids = [c[0] for c in teacher_courses]
            if course_ids:
                grade_students = db.query(Grade.student_id).filter(
                    Grade.course_id.in_(course_ids)
                ).distinct().all()
                student_ids = [s[0] for s in grade_students]
    elif assign_data.student_ids:
        student_ids = assign_data.student_ids
    elif assign_data.group:
        students = db.query(Student).filter(Student.group == assign_data.group).all()
        student_ids = [s.id for s in students]
    elif assign_data.department:
        if assign_data.department == "ИТ":
            students = db.query(Student).filter(Student.group.like("ИТ-%")).all()
        elif assign_data.department == "ПИ":
            students = db.query(Student).filter(Student.group.like("ПИ-%")).all()
        else:
            students = []
        student_ids = [s.id for s in students]
    elif assign_data.course_id:
        # Проверка прав для учителя
        if current_user.role == "teacher":
            teacher_course = db.query(CourseTeacher).filter(
                CourseTeacher.course_id == assign_data.course_id,
                CourseTeacher.teacher_id == current_user.teacher_id
            ).first()
            if not teacher_course:
                raise HTTPException(status_code=403, detail="Доступ запрещен: это не ваш курс")
        
        grade_students = db.query(Grade.student_id).filter(
            Grade.course_id == assign_data.course_id
        ).distinct().all()
        student_ids = [s[0] for s in grade_students]
    
    if not student_ids:
        raise HTTPException(status_code=400, detail="Не найдено студентов для выдачи достижения")
    
    # Выдаем достижение каждому студенту
    created_count = 0
    for student_id in student_ids:
        # Проверяем, нет ли уже такого достижения у студента
        if has_course_id_column:
            try:
                existing = db.query(Achievement.id).filter(
                    Achievement.student_id == student_id,
                    Achievement.name == template["name"],
                    Achievement.course_id == template["course_id"]
                ).first()
            except OperationalError:
                # Если ошибка, используем raw SQL (без course_id)
                existing_result = db.execute(
                    text("SELECT id FROM achievements WHERE student_id = :student_id AND name = :name"),
                    {"student_id": student_id, "name": template["name"]}
                )
                existing = existing_result.fetchone()
        else:
            # Используем raw SQL для проверки (без course_id)
            existing_result = db.execute(
                text("SELECT id FROM achievements WHERE student_id = :student_id AND name = :name"),
                {"student_id": student_id, "name": template["name"]}
            )
            existing = existing_result.fetchone()
        
        if not existing:
            if has_course_id_column:
                achievement = Achievement(
                    student_id=student_id,
                    course_id=template["course_id"],
                    name=template["name"],
                    description=template["description"],
                    icon=template["icon"],
                    points=template["points"],
                    unlocked_at=datetime.now()
                )
                db.add(achievement)
            else:
                # Используем raw SQL для вставки
                db.execute(
                    text("""
                        INSERT INTO achievements (student_id, name, description, icon, points, unlocked_at)
                        VALUES (:student_id, :name, :description, :icon, :points, :unlocked_at)
                    """),
                    {
                        "student_id": student_id,
                        "name": template["name"],
                        "description": template["description"],
                        "icon": template["icon"],
                        "points": template["points"],
                        "unlocked_at": datetime.now()
                    }
                )
            created_count += 1
    
    db.commit()
    
    # Логируем выдачу достижений
    try:
        import json
        activity_log = ActivityLog(
            user_id=current_user.id,
            action_type="create",
            table_name="achievements",
            record_id=template["id"],
            old_values=None,
            new_values=json.dumps({
                "achievement_id": template["id"],
                "assigned_count": created_count,
                "student_ids": student_ids[:10]  # Первые 10 для примера
            })
        )
        db.add(activity_log)
        db.commit()
    except Exception as e:
        print(f"Ошибка логирования: {e}")
    
    return {
        "message": f"Достижение выдано {created_count} студентам",
        "assigned_count": created_count
    }


@app.delete("/api/achievements/{achievement_id}")
async def delete_achievement(
    achievement_id: int,
    permanent: bool = False,  # True для окончательного удаления, False для soft delete
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Удаление достижения (soft delete или permanent)"""
    if current_user.role not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    # Проверяем, есть ли новая структура
    try:
        db.execute(text("SELECT id FROM achievement_templates LIMIT 1"))
        has_new_structure = True
    except OperationalError:
        has_new_structure = False
    
    if has_new_structure:
        # Используем новую структуру
        template = db.query(AchievementTemplate).filter(
            AchievementTemplate.id == achievement_id
        ).first()
        
        if not template:
            raise HTTPException(status_code=404, detail="Достижение не найдено")
        
        # Проверка прав: только админ или создатель может удалять
        if current_user.role == "teacher":
            # Преподаватель может удалять только те достижения, которые он создал
            if template.created_by_id != current_user.teacher_id:
                raise HTTPException(status_code=403, detail="Доступ запрещен: вы можете удалять только свои достижения")
        
        if permanent:
            # Окончательное удаление - удаляем все связи студентов и сам шаблон
            db.query(StudentAchievement).filter(
                StudentAchievement.achievement_template_id == achievement_id
            ).delete()
            db.delete(template)
            db.commit()
            return {"message": "Достижение окончательно удалено"}
        else:
            # Soft delete
            template.deleted = True
            db.commit()
            return {"message": "Достижение помечено как удаленное"}
    
    # Старая логика для обратной совместимости
    # Проверяем существование колонок
    has_deleted_column = True
    has_course_id_column = True
    try:
        db.execute(text("SELECT deleted FROM achievements LIMIT 1"))
    except OperationalError:
        has_deleted_column = False
    
    try:
        db.execute(text("SELECT course_id FROM achievements LIMIT 1"))
    except OperationalError:
        has_course_id_column = False
    
    # Инициализируем переменные
    ach_id = None
    student_id = None
    course_id = None
    name = None
    description = None
    icon = None
    points = None
    achievement_tuple = None
    
    # Получаем достижение с явным выбором колонок
    try:
        if has_course_id_column:
            achievement_tuple = db.query(
                Achievement.id,
                Achievement.student_id,
                Achievement.course_id,
                Achievement.name,
                Achievement.description,
                Achievement.icon,
                Achievement.points
            ).filter(Achievement.id == achievement_id).first()
            if achievement_tuple:
                ach_id, student_id, course_id, name, description, icon, points = achievement_tuple
        else:
            achievement_tuple = db.query(
                Achievement.id,
                Achievement.student_id,
                Achievement.name,
                Achievement.description,
                Achievement.icon,
                Achievement.points
            ).filter(Achievement.id == achievement_id).first()
            if achievement_tuple:
                ach_id, student_id, name, description, icon, points = achievement_tuple
                course_id = None
    except OperationalError:
        # Если даже базовые колонки не работают, используем raw SQL
        result = db.execute(
            text("SELECT id, student_id, name, description, icon, points FROM achievements WHERE id = :id"),
            {"id": achievement_id}
        )
        row = result.fetchone()
        if row:
            ach_id, student_id, name, description, icon, points = row
            course_id = None
    
    if not ach_id:
        raise HTTPException(status_code=404, detail="Достижение не найдено")
    
    # Проверка прав для учителя: достижение должно быть связано с его курсом
    if current_user.role == "teacher" and course_id:
        teacher_course = db.query(CourseTeacher).filter(
            CourseTeacher.course_id == course_id,
            CourseTeacher.teacher_id == current_user.teacher_id
        ).first()
        if not teacher_course:
            raise HTTPException(status_code=403, detail="Доступ запрещен: это не ваше достижение")
    
    if permanent:
        # Окончательное удаление из БД
        # Удаляем все достижения с таким же именем
        if has_course_id_column:
            # Используем raw SQL для надежности
            if course_id:
                db.execute(
                    text("DELETE FROM achievements WHERE name = :name AND course_id = :course_id AND student_id IS NOT NULL"),
                    {"name": name, "course_id": course_id}
                )
                db.execute(
                    text("DELETE FROM achievements WHERE id = :id"),
                    {"id": achievement_id}
                )
            else:
                db.execute(
                    text("DELETE FROM achievements WHERE name = :name AND course_id IS NULL AND student_id IS NOT NULL"),
                    {"name": name}
                )
                db.execute(
                    text("DELETE FROM achievements WHERE id = :id"),
                    {"id": achievement_id}
                )
        else:
            # Используем raw SQL без course_id
            db.execute(
                text("DELETE FROM achievements WHERE name = :name AND student_id IS NOT NULL"),
                {"name": name}
            )
            db.execute(
                text("DELETE FROM achievements WHERE id = :id"),
                {"id": achievement_id}
            )
        db.commit()
        return {"message": "Достижение окончательно удалено"}
    else:
        # Soft delete - устанавливаем флаг deleted
        if has_deleted_column:
            # Обновляем все достижения с таким же шаблоном используя raw SQL
            if has_course_id_column and course_id:
                db.execute(
                    text("UPDATE achievements SET deleted = 1 WHERE name = :name AND course_id = :course_id"),
                    {"name": name, "course_id": course_id}
                )
            elif has_course_id_column:
                db.execute(
                    text("UPDATE achievements SET deleted = 1 WHERE name = :name AND course_id IS NULL"),
                    {"name": name}
                )
            else:
                db.execute(
                    text("UPDATE achievements SET deleted = 1 WHERE name = :name"),
                    {"name": name}
                )
            db.commit()
            return {"message": "Достижение помечено как удаленное"}
        else:
            # Если колонки нет, создаем её (миграция)
            try:
                db.execute(text("ALTER TABLE achievements ADD COLUMN deleted BOOLEAN DEFAULT 0"))
                db.commit()
                if has_course_id_column and course_id:
                    db.execute(
                        text("UPDATE achievements SET deleted = 1 WHERE name = :name AND course_id = :course_id"),
                        {"name": name, "course_id": course_id}
                    )
                elif has_course_id_column:
                    db.execute(
                        text("UPDATE achievements SET deleted = 1 WHERE name = :name AND course_id IS NULL"),
                        {"name": name}
                    )
                else:
                    db.execute(
                        text("UPDATE achievements SET deleted = 1 WHERE name = :name"),
                        {"name": name}
                    )
                db.commit()
                return {"message": "Достижение помечено как удаленное"}
            except OperationalError:
                # Если не удалось добавить колонку, делаем hard delete
                if has_course_id_column and course_id:
                    db.execute(
                        text("DELETE FROM achievements WHERE name = :name AND course_id = :course_id"),
                        {"name": name, "course_id": course_id}
                    )
                elif has_course_id_column:
                    db.execute(
                        text("DELETE FROM achievements WHERE name = :name AND course_id IS NULL"),
                        {"name": name}
                    )
                else:
                    db.execute(
                        text("DELETE FROM achievements WHERE name = :name"),
                        {"name": name}
                    )
                db.commit()
                return {"message": "Достижение удалено (колонка deleted недоступна)"}


@app.post("/api/achievements/{achievement_id}/restore")
async def restore_achievement(
    achievement_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Восстановление удаленного достижения"""
    if current_user.role not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    # Проверяем, есть ли новая структура
    try:
        db.execute(text("SELECT id FROM achievement_templates LIMIT 1"))
        has_new_structure = True
    except OperationalError:
        has_new_structure = False
    
    if has_new_structure:
        # Используем новую структуру
        template = db.query(AchievementTemplate).filter(
            AchievementTemplate.id == achievement_id
        ).first()
        
        if not template:
            raise HTTPException(status_code=404, detail="Достижение не найдено")
        
        # Проверка прав: только админ или создатель может восстанавливать
        if current_user.role == "teacher":
            # Преподаватель может восстанавливать только те достижения, которые он создал
            if template.created_by_id != current_user.teacher_id:
                raise HTTPException(status_code=403, detail="Доступ запрещен: вы можете восстанавливать только свои достижения")
        
        template.deleted = False
        db.commit()
        return {"message": "Достижение восстановлено"}
    
    # Старая логика для обратной совместимости
    # Проверяем существование колонок
    has_deleted_column = True
    has_course_id_column = True
    try:
        db.execute(text("SELECT deleted FROM achievements LIMIT 1"))
    except OperationalError:
        raise HTTPException(status_code=400, detail="Колонка deleted не существует")
    
    try:
        db.execute(text("SELECT course_id FROM achievements LIMIT 1"))
    except OperationalError:
        has_course_id_column = False
    
    # Инициализируем переменные
    ach_id = None
    student_id = None
    course_id = None
    name = None
    achievement_tuple = None
    
    # Получаем достижение с явным выбором колонок
    try:
        if has_course_id_column:
            achievement_tuple = db.query(
                Achievement.id,
                Achievement.student_id,
                Achievement.course_id,
                Achievement.name
            ).filter(Achievement.id == achievement_id).first()
            if achievement_tuple:
                ach_id, student_id, course_id, name = achievement_tuple
        else:
            achievement_tuple = db.query(
                Achievement.id,
                Achievement.student_id,
                Achievement.name
            ).filter(Achievement.id == achievement_id).first()
            if achievement_tuple:
                ach_id, student_id, name = achievement_tuple
                course_id = None
    except OperationalError:
        # Если даже базовые колонки не работают, используем raw SQL
        result = db.execute(
            text("SELECT id, student_id, name FROM achievements WHERE id = :id"),
            {"id": achievement_id}
        )
        row = result.fetchone()
        if row:
            ach_id, student_id, name = row
            course_id = None
    
    if not ach_id or not name:
        raise HTTPException(status_code=404, detail="Достижение не найдено")
    
    # Проверка прав для учителя
    if current_user.role == "teacher" and course_id:
        teacher_course = db.query(CourseTeacher).filter(
            CourseTeacher.course_id == course_id,
            CourseTeacher.teacher_id == current_user.teacher_id
        ).first()
        if not teacher_course:
            raise HTTPException(status_code=403, detail="Доступ запрещен: это не ваше достижение")
    
    # Восстанавливаем все достижения с таким же шаблоном используя raw SQL
    if has_course_id_column and course_id:
        db.execute(
            text("UPDATE achievements SET deleted = 0 WHERE name = :name AND course_id = :course_id"),
            {"name": name, "course_id": course_id}
        )
    elif has_course_id_column:
        db.execute(
            text("UPDATE achievements SET deleted = 0 WHERE name = :name AND course_id IS NULL"),
            {"name": name}
        )
    else:
        db.execute(
            text("UPDATE achievements SET deleted = 0 WHERE name = :name"),
            {"name": name}
        )
    db.commit()
    
    return {"message": "Достижение восстановлено"}


@app.get("/api/achievements/{achievement_id}/students")
async def get_achievement_students(
    achievement_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получение списка студентов, получивших конкретное достижение (только для админа)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    # Проверяем, есть ли новая структура
    try:
        db.execute(text("SELECT id FROM achievement_templates LIMIT 1"))
        has_new_structure = True
    except OperationalError:
        has_new_structure = False
    
    if has_new_structure:
        # Используем новую структуру
        template = db.query(AchievementTemplate).filter(
            AchievementTemplate.id == achievement_id
        ).first()
        
        if not template:
            raise HTTPException(status_code=404, detail="Достижение не найдено")
        
        # Получаем все связи студентов с этим шаблоном
        student_achievements = db.query(StudentAchievement).filter(
            StudentAchievement.achievement_template_id == achievement_id
        ).all()
        
        # Получаем информацию о студентах
        student_ids = [sa.student_id for sa in student_achievements]
        students = db.query(Student).filter(Student.id.in_(student_ids)).all() if student_ids else []
        students_dict = {s.id: s for s in students}
        
        # Формируем результат
        result = []
        for sa in student_achievements:
            student = students_dict.get(sa.student_id)
            if student:
                result.append({
                    "achievement_id": sa.id,
                    "student_id": student.id,
                    "student_name": student.name,
                    "student_email": student.email,
                    "student_group": student.group,
                    "unlocked_at": sa.unlocked_at.isoformat() if sa.unlocked_at else None
                })
        
        course_name = None
        if template.course_id:
            course = db.query(Course).filter(Course.id == template.course_id).first()
            if course:
                course_name = course.name
        
        return {
            "achievement": {
                "id": template.id,
                "name": template.name,
                "description": template.description,
                "icon": template.icon,
                "points": template.points,
                "course_id": template.course_id,
                "course_name": course_name
            },
            "students": result
        }
    
    # Старая логика для обратной совместимости
    # Получаем шаблон достижения
    try:
        template_query = db.query(
            Achievement.id,
            Achievement.student_id,
            Achievement.course_id,
            Achievement.name,
            Achievement.description,
            Achievement.icon,
            Achievement.points
        ).filter(Achievement.id == achievement_id).first()
        has_course_id_column = True
    except OperationalError:
        template_query = db.query(
            Achievement.id,
            Achievement.student_id,
            Achievement.name,
            Achievement.description,
            Achievement.icon,
            Achievement.points
        ).filter(Achievement.id == achievement_id).first()
        has_course_id_column = False
    
    if not template_query:
        raise HTTPException(status_code=404, detail="Достижение не найдено")
    
    if has_course_id_column:
        template_id, template_student_id, template_course_id, template_name, template_description, template_icon, template_points = template_query
    else:
        template_id, template_student_id, template_name, template_description, template_icon, template_points = template_query
        template_course_id = None
    
    # Получаем все достижения с таким же именем и course_id (выданные студентам)
    if has_course_id_column:
        if template_course_id:
            achievements_query = db.query(
                Achievement.id,
                Achievement.student_id,
                Achievement.unlocked_at
            ).filter(
                Achievement.name == template_name,
                Achievement.course_id == template_course_id,
                Achievement.student_id.isnot(None)
            )
        else:
            achievements_query = db.query(
                Achievement.id,
                Achievement.student_id,
                Achievement.unlocked_at
            ).filter(
                Achievement.name == template_name,
                Achievement.course_id.is_(None),
                Achievement.student_id.isnot(None)
            )
    else:
        achievements_query = db.query(
            Achievement.id,
            Achievement.student_id,
            Achievement.unlocked_at
        ).filter(
            Achievement.name == template_name,
            Achievement.student_id.isnot(None)
        )
    
    achievements_list = achievements_query.all()
    
    # Получаем информацию о студентах
    student_ids = [a[1] for a in achievements_list if a[1]]
    students = db.query(Student).filter(Student.id.in_(student_ids)).all() if student_ids else []
    
    # Формируем результат
    result = []
    for ach_id, student_id, unlocked_at in achievements_list:
        student = next((s for s in students if s.id == student_id), None)
        if student:
            result.append({
                "achievement_id": ach_id,
                "student_id": student.id,
                "student_name": student.name,
                "student_email": student.email,
                "student_group": student.group,
                "unlocked_at": unlocked_at.isoformat() if unlocked_at else None
            })
    
    return {
        "achievement": {
            "id": template_id,
            "name": template_name,
            "description": template_description,
            "icon": template_icon,
            "points": template_points,
            "course_id": template_course_id
        },
        "students": result
    }


@app.delete("/api/achievements/{achievement_id}/students/{student_id}")
async def remove_achievement_from_student(
    achievement_id: int,
    student_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Удаление достижения у конкретного студента (только для админа)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    # Получаем достижение студента
    achievement = db.query(Achievement).filter(
        Achievement.id == achievement_id,
        Achievement.student_id == student_id
    ).first()
    
    if not achievement:
        raise HTTPException(status_code=404, detail="Достижение не найдено")
    
    # Удаляем достижение
    db.delete(achievement)
    db.commit()
    
    return {"message": f"Достижение удалено у студента {student_id}"}


# Логирование

@app.get("/api/logs/login")
async def get_login_logs(
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получение логов входов (только для админа)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещен: требуется роль администратора")
    
    logs = db.query(LoginLog).order_by(desc(LoginLog.login_time)).limit(limit).all()
    
    return [
        {
            "id": log.id,
            "user_id": log.user_id,
            "user_email": log.user.email if log.user else None,
            "login_time": str(log.login_time),
            "logout_time": str(log.logout_time) if log.logout_time else None,
            "ip_address": log.ip_address,
            "user_agent": log.user_agent
        }
        for log in logs
    ]


@app.get("/api/logs/activity")
async def get_activity_logs(
    limit: int = 100,
    table_name: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получение логов активности (только для админа)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещен: требуется роль администратора")
    
    query = db.query(ActivityLog)
    
    if table_name:
        query = query.filter(ActivityLog.table_name == table_name)
    
    logs = query.order_by(desc(ActivityLog.timestamp)).limit(limit).all()
    
    return [
        {
            "id": log.id,
            "user_id": log.user_id,
            "user_email": log.user.email if log.user else None,
            "action_type": log.action_type,
            "table_name": log.table_name,
            "record_id": log.record_id,
            "old_values": log.old_values,
            "new_values": log.new_values,
            "timestamp": str(log.timestamp)
        }
        for log in logs
    ]


@app.post("/api/auth/logout")
async def logout(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Выход из системы (логирование выхода)"""
    # Находим последний незакрытый лог входа
    last_login = db.query(LoginLog).filter(
        LoginLog.user_id == current_user.id,
        LoginLog.logout_time.is_(None)
    ).order_by(desc(LoginLog.login_time)).first()
    
    if last_login:
        last_login.logout_time = datetime.now()
        db.commit()
    
    return {"message": "Выход выполнен успешно"}


@app.get("/api/attendance/{student_id}", response_model=List[AttendanceResponse])
async def get_student_attendance(
    student_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    course_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получение данных посещаемости студента для календаря"""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Студент не найден")
    
    if not can_access_student(current_user, student.id, db):
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    # Используем явный выбор полей через with_entities, чтобы избежать ошибок с несуществующими колонками
    # Сначала получаем только базовые поля, которые точно есть
    base_query = db.query(
        Attendance.id,
        Attendance.student_id,
        Attendance.course_id,
        Attendance.date,
        Attendance.present
    ).filter(Attendance.student_id == student_id)
    
    # Для преподавателя фильтруем только по его курсам
    if current_user.role == "teacher":
        teacher_courses = db.query(CourseTeacher.course_id).filter(
            CourseTeacher.teacher_id == current_user.teacher_id
        ).all()
        course_ids = [c[0] for c in teacher_courses]
        if course_ids:
            base_query = base_query.filter(
                or_(
                    Attendance.course_id.in_(course_ids),
                    Attendance.course_id.is_(None)  # Посещаемость без курса (общая)
                )
            )
        else:
            # Если у преподавателя нет курсов, возвращаем пустой список
            base_query = base_query.filter(Attendance.course_id == -1)
    
    if start_date:
        base_query = base_query.filter(Attendance.date >= start_date)
    if end_date:
        base_query = base_query.filter(Attendance.date <= end_date)
    if course_id:
        # Дополнительная проверка для преподавателя: курс должен быть его
        if current_user.role == "teacher":
            teacher_course = db.query(CourseTeacher).filter(
                CourseTeacher.course_id == course_id,
                CourseTeacher.teacher_id == current_user.teacher_id
            ).first()
            if not teacher_course:
                raise HTTPException(status_code=403, detail="Доступ запрещен: это не ваш курс")
        base_query = base_query.filter(Attendance.course_id == course_id)
    
    attendance_records = base_query.order_by(Attendance.date).all()
    
    result = []
    for att_tuple in attendance_records:
        att_id, att_student_id, att_course_id, att_date, att_present = att_tuple
        
        course_name = None
        if att_course_id:
            course = db.query(Course).filter(Course.id == att_course_id).first()
            if course:
                course_name = course.name
        
        # Для совместимости со старой схемой просто возвращаем None
        # Эти поля будут доступны после миграции БД
        building = None
        entry_time = None
        exit_time = None
        
        result.append(AttendanceResponse(
            id=att_id,
            student_id=att_student_id,
            course_id=att_course_id,
            date=att_date,
            present=att_present,
            building=building,
            entry_time=entry_time,
            exit_time=exit_time,
            course_name=course_name
        ))
    
    return result


@app.get("/api/attendance/by-hash/{hash_id}", response_model=List[AttendanceResponse])
async def get_student_attendance_by_hash(
    hash_id: str,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    course_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получение данных посещаемости студента по hash для календаря"""
    student = find_student_by_hash(hash_id, db)
    if not student:
        raise HTTPException(status_code=404, detail="Студент не найден")
    
    if not can_access_student(current_user, student.id, db):
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    return await get_student_attendance(
        student.id, start_date, end_date, course_id, current_user, db
    )


@app.get("/api/ai/advice/student")
async def get_ai_student_advice(
    advice_type: str = "pleasant",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Получение ИИ-совета для студента
    
    Args:
        advice_type: Тип совета - "pleasant" (приятный) или "useful" (полезный)
    """
    if current_user.role != "student" or not current_user.student_id:
        raise HTTPException(status_code=403, detail="Доступно только для студентов")
    
    if advice_type not in ["pleasant", "useful"]:
        raise HTTPException(status_code=400, detail="Неверный тип совета. Используйте 'pleasant' или 'useful'")
    
    try:
        advice = get_student_advice(db, current_user.student_id, advice_type)
        return {"advice": advice, "type": advice_type}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка генерации совета: {str(e)}")


@app.get("/api/ai/advice/student/{student_id}")
async def get_ai_student_advice_by_id(
    student_id: int,
    advice_type: str = "pleasant",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Получение ИИ-совета для конкретного студента (для преподавателей и админов)
    
    Args:
        student_id: ID студента
        advice_type: Тип совета - "pleasant" (приятный) или "useful" (полезный)
    """
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Студент не найден")
    
    if not can_access_student(current_user, student_id, db):
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    if advice_type not in ["pleasant", "useful"]:
        raise HTTPException(status_code=400, detail="Неверный тип совета. Используйте 'pleasant' или 'useful'")
    
    try:
        advice = get_student_advice(db, student_id, advice_type)
        return {"advice": advice, "type": advice_type}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка генерации совета: {str(e)}")


@app.get("/api/ai/advice/teacher")
async def get_ai_teacher_advice(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получение ИИ-совета для преподавателя"""
    if current_user.role != "teacher" or not current_user.teacher_id:
        raise HTTPException(status_code=403, detail="Доступно только для преподавателей")
    
    try:
        advice = get_teacher_advice(db, current_user.teacher_id)
        return {"advice": advice}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка генерации совета: {str(e)}")


@app.get("/api/ai/advice/student/{student_id}/course/{course_id}")
async def get_ai_student_course_advice(
    student_id: int,
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получение ИИ-совета для студента по конкретному курсу"""
    # Проверяем доступ
    if current_user.role == "student":
        if current_user.student_id != student_id:
            raise HTTPException(status_code=403, detail="Доступ запрещен")
    elif current_user.role in ["teacher", "admin"]:
        # Преподаватели и админы могут видеть советы для студентов
        if not can_access_student(current_user, student_id, db):
            raise HTTPException(status_code=403, detail="Доступ запрещен")
    else:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    # Проверяем существование студента и курса
    student = db.query(Student).filter(Student.id == student_id).first()
    course = db.query(Course).filter(Course.id == course_id).first()
    
    if not student:
        raise HTTPException(status_code=404, detail="Студент не найден")
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")
    
    try:
        advice = get_student_course_advice(db, student_id, course_id)
        return {"advice": advice}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка генерации совета: {str(e)}")


@app.post("/api/ai/advice/admin")
async def get_ai_admin_advice(
    request: AdminQueryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Получение ИИ-совета/ответа для администратора
    
    Args:
        request: Запрос с вопросом администратора на естественном языке
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Доступно только для администраторов")
    
    try:
        advice = get_admin_advice(db, request.query)
        return {"advice": advice, "query": request.query}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка генерации совета: {str(e)}")


