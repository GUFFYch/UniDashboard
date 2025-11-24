from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, Text, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Student(Base):
    __tablename__ = "students"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True)
    group = Column(String)  # Название группы (для обратной совместимости)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True)  # Ссылка на таблицу групп
    year = Column(Integer)
    is_headman = Column(Boolean, default=False)  # Староста группы
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    grades = relationship("Grade", back_populates="student")
    attendance = relationship("Attendance", back_populates="student")
    lms_activity = relationship("LMSActivity", back_populates="student")
    achievements = relationship("Achievement", back_populates="student")  # Старая таблица
    student_achievements = relationship("StudentAchievement", back_populates="student")  # Новая таблица
    group_relation = relationship("Group", foreign_keys=[group_id], back_populates="students")


class Course(Base):
    __tablename__ = "courses"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    code = Column(String, unique=True)
    credits = Column(Integer)
    semester = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    grades = relationship("Grade", back_populates="course")
    schedule = relationship("Schedule", back_populates="course")
    attendance = relationship("Attendance", back_populates="course")


class Teacher(Base):
    __tablename__ = "teachers"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True)
    department = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    courses = relationship("CourseTeacher", back_populates="teacher")
    schedule = relationship("Schedule", back_populates="teacher")


class CourseTeacher(Base):
    __tablename__ = "course_teachers"
    
    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"))
    teacher_id = Column(Integer, ForeignKey("teachers.id"))
    
    course = relationship("Course")
    teacher = relationship("Teacher", back_populates="courses")


class Grade(Base):
    __tablename__ = "grades"
    
    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"))
    course_id = Column(Integer, ForeignKey("courses.id"))
    value = Column(Float, nullable=False)
    type = Column(String)  # exam, test, coursework, homework
    date = Column(Date)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    student = relationship("Student", back_populates="grades")
    course = relationship("Course", back_populates="grades")


class Attendance(Base):
    __tablename__ = "attendance"
    
    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"))
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=True)  # Может быть None для общих посещений
    date = Column(Date, nullable=False)
    present = Column(Boolean, default=True)
    building = Column(String)  # ПВ-78, ПВ-86, Ст, МП, СГ
    entry_time = Column(DateTime(timezone=True))  # Время входа в здание
    exit_time = Column(DateTime(timezone=True))  # Время выхода из здания
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    student = relationship("Student", back_populates="attendance")
    course = relationship("Course", back_populates="attendance")


class Schedule(Base):
    __tablename__ = "schedule"
    
    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"))
    teacher_id = Column(Integer, ForeignKey("teachers.id"))
    day_of_week = Column(Integer)  # 0-6 (Monday-Sunday)
    start_time = Column(String)
    end_time = Column(String)
    room = Column(String)
    type = Column(String)  # lecture, seminar, lab
    
    course = relationship("Course", back_populates="schedule")
    teacher = relationship("Teacher", back_populates="schedule")


class LMSActivity(Base):
    __tablename__ = "lms_activity"
    
    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"))
    action_type = Column(String)  # login, view_material, submit_assignment, forum_post
    resource = Column(String)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    
    student = relationship("Student", back_populates="lms_activity")


class LibraryActivity(Base):
    __tablename__ = "library_activity"
    
    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"))
    resource_type = Column(String)  # book, article, ebook
    resource_name = Column(String)
    action = Column(String)  # borrow, return, view
    timestamp = Column(DateTime(timezone=True), server_default=func.now())


class Event(Base):
    __tablename__ = "events"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    type = Column(String)  # hackathon, conference, workshop, competition
    date = Column(Date)
    participants_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# Старая модель Achievement (для обратной совместимости во время миграции)
class Achievement(Base):
    __tablename__ = "achievements"
    
    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=True)  # None для шаблонов достижений
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=True)  # None для общих достижений
    name = Column(String, nullable=False)
    description = Column(Text)
    icon = Column(String)
    points = Column(Integer, default=0)
    unlocked_at = Column(DateTime(timezone=True), nullable=True)  # None для шаблонов
    deleted = Column(Boolean, default=False)  # Флаг удаления (soft delete)
    
    student = relationship("Student", back_populates="achievements")
    course = relationship("Course")


# Новая нормализованная структура
class AchievementTemplate(Base):
    __tablename__ = "achievement_templates"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    icon = Column(String)
    points = Column(Integer, default=0)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=True)  # None для общих достижений
    deleted = Column(Boolean, default=False)  # Флаг удаления (soft delete)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by_id = Column(Integer, ForeignKey("teachers.id"), nullable=True)  # Кто создал достижение (для преподавателей)
    is_public = Column(Boolean, default=False)  # True - достижение "для всех", может выдавать кто угодно
    
    course = relationship("Course")
    student_achievements = relationship("StudentAchievement", back_populates="achievement_template")


class StudentAchievement(Base):
    __tablename__ = "student_achievements"
    
    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    achievement_template_id = Column(Integer, ForeignKey("achievement_templates.id"), nullable=False)
    unlocked_at = Column(DateTime(timezone=True), server_default=func.now())
    
    student = relationship("Student", back_populates="student_achievements")
    achievement_template = relationship("AchievementTemplate", back_populates="student_achievements")
    
    __table_args__ = (
        {'sqlite_autoincrement': True},
    )


class StudentPrediction(Base):
    __tablename__ = "student_predictions"
    
    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"))
    burnout_risk = Column(Float)  # 0-1
    success_probability = Column(Float)  # 0-1
    predicted_gpa = Column(Float)
    calculated_at = Column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False)  # student, teacher, admin
    student_id = Column(Integer, ForeignKey("students.id"), nullable=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    student = relationship("Student")
    teacher = relationship("Teacher")


class LoginLog(Base):
    __tablename__ = "login_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    login_time = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    logout_time = Column(DateTime(timezone=True), nullable=True)
    ip_address = Column(String)
    user_agent = Column(String)
    
    user = relationship("User")


class ActivityLog(Base):
    __tablename__ = "activity_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Может быть None для системных действий
    action_type = Column(String, nullable=False)  # create, update, delete
    table_name = Column(String, nullable=False)  # Название таблицы
    record_id = Column(Integer, nullable=False)  # ID записи
    old_values = Column(Text)  # JSON со старыми значениями
    new_values = Column(Text)  # JSON с новыми значениями
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    
    user = relationship("User")


class Group(Base):
    __tablename__ = "groups"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False, index=True)  # Название группы (например, "ИТ-1")
    department = Column(String)  # Кафедра (ИТ, ПИ и т.д.)
    total_students = Column(Integer, default=0)  # Количество студентов
    headman_id = Column(Integer, ForeignKey("students.id"), nullable=True)  # ID старосты
    average_gpa = Column(Float, default=0.0)  # Средний балл группы
    average_attendance_rate = Column(Float, default=0.0)  # Средняя посещаемость
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())  # Время последнего обновления
    
    headman = relationship("Student", foreign_keys=[headman_id], post_update=True)
    students = relationship("Student", primaryjoin="Group.id == Student.group_id", back_populates="group_relation")

