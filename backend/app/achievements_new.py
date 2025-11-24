"""
Новые функции для работы с нормализованной структурой achievements
"""
from sqlalchemy import func, desc, and_, or_
from sqlalchemy.orm import Session
from typing import List, Optional
from fastapi import HTTPException
from app.models import AchievementTemplate, StudentAchievement, Course, CourseTeacher, User, Student, Grade


async def get_all_achievements_new(
    course_id: Optional[int],
    include_deleted: bool,
    current_user: User,
    db: Session
):
    """Получение всех достижений используя новую нормализованную структуру"""
    
    # Базовый запрос шаблонов
    query = db.query(AchievementTemplate)
    
    # Фильтр по курсу
    if course_id:
        query = query.filter(AchievementTemplate.course_id == course_id)
    
    # Фильтр для преподавателя - его курсы + публичные достижения
    # Для студентов и админов показываем все достижения
    if current_user.role == "teacher":
        teacher_courses = db.query(CourseTeacher.course_id).filter(
            CourseTeacher.teacher_id == current_user.teacher_id
        ).all()
        course_ids = [c[0] for c in teacher_courses]
        if course_ids:
            # Показываем достижения по курсам преподавателя + публичные достижения
            query = query.filter(
                or_(
                    AchievementTemplate.course_id.in_(course_ids),
                    AchievementTemplate.is_public == True  # Публичные достижения "для всех"
                )
            )
        else:
            # Если у преподавателя нет курсов, показываем только публичные достижения
            query = query.filter(AchievementTemplate.is_public == True)
    # Для студентов показываем все достижения (не удаленные)
    # Админы видят все (включая удаленные, если include_deleted=True)
    
    # Фильтр удаленных
    if not include_deleted:
        query = query.filter(AchievementTemplate.deleted == False)
    
    templates = query.all()
    
    # Для каждого шаблона считаем количество получивших студентов
    result = []
    for template in templates:
        # Подсчитываем количество студентов с этим достижением
        count_query = db.query(func.count(StudentAchievement.id)).filter(
            StudentAchievement.achievement_template_id == template.id
        )
        total_earned = count_query.scalar() or 0
        
        # Получаем название курса
        course_name = None
        if template.course_id:
            course = db.query(Course).filter(Course.id == template.course_id).first()
            if course:
                course_name = course.name
        
        result.append({
            "id": template.id,
            "name": template.name,
            "description": template.description,
            "icon": template.icon,
            "points": template.points,
            "course_id": template.course_id,
            "course_name": course_name,
            "total_earned": total_earned,
            "deleted": template.deleted,
            "created_by_id": template.created_by_id,
            "is_public": template.is_public if hasattr(template, 'is_public') else False
        })
    
    return result


async def get_student_achievements_new(
    student_id: int,
    current_user: User,
    db: Session
):
    """Получение достижений студента используя новую структуру"""
    
    # Получаем все связи студента с достижениями
    student_achievements = db.query(StudentAchievement).filter(
        StudentAchievement.student_id == student_id
    ).order_by(desc(StudentAchievement.unlocked_at)).all()
    
    result = []
    total_points = 0
    
    for sa in student_achievements:
        template = sa.achievement_template
        
        # Пропускаем удаленные шаблоны
        if template.deleted:
            continue
        
        total_points += template.points or 0
        
        result.append({
            "id": sa.id,
            "achievement_template_id": template.id,
            "name": template.name,
            "description": template.description,
            "icon": template.icon,
            "points": template.points,
            "course_id": template.course_id,
            "unlocked_at": sa.unlocked_at.isoformat() if sa.unlocked_at else None
        })
    
    return {
        "achievements": result,
        "total_points": total_points
    }


async def create_achievement_template_new(
    name: str,
    description: Optional[str],
    icon: Optional[str],
    points: int,
    course_id: Optional[int],
    is_public: Optional[bool],
    current_user: User,
    db: Session
):
    """Создание нового шаблона достижения"""
    
    # Если is_public=True, то course_id должен быть None
    if is_public and course_id:
        raise HTTPException(status_code=400, detail="Публичное достижение не может быть привязано к курсу")
    
    # Проверка прав для преподавателя
    if current_user.role == "teacher":
        if is_public:
            # Преподаватель может создавать публичные достижения
            pass
        elif course_id:
            # Если привязано к курсу, курс должен быть его
            teacher_course = db.query(CourseTeacher).filter(
                CourseTeacher.course_id == course_id,
                CourseTeacher.teacher_id == current_user.teacher_id
            ).first()
            if not teacher_course:
                raise HTTPException(status_code=403, detail="Доступ запрещен: это не ваш курс")
        else:
            # Преподаватель не может создавать обычные общие достижения (только админ)
            raise HTTPException(status_code=403, detail="Доступ запрещен: вы можете создавать только достижения по вашим курсам или публичные достижения")
    
    # Сохраняем ID создателя (для преподавателей)
    created_by_id = None
    if current_user.role == "teacher":
        created_by_id = current_user.teacher_id
    
    template = AchievementTemplate(
        name=name,
        description=description,
        icon=icon or "🏆",
        points=points,
        course_id=course_id,
        created_by_id=created_by_id,
        is_public=is_public or False
    )
    
    db.add(template)
    db.commit()
    db.refresh(template)
    
    return {
        "id": template.id,
        "name": template.name,
        "description": template.description,
        "icon": template.icon,
        "points": template.points,
        "course_id": template.course_id
    }


async def assign_achievement_new(
    achievement_template_id: int,
    student_ids: List[int],
    current_user: User,
    db: Session
):
    """Выдача достижения студентам используя новую структуру"""
    
    template = db.query(AchievementTemplate).filter(
        AchievementTemplate.id == achievement_template_id
    ).first()
    
    if not template:
        raise HTTPException(status_code=404, detail="Шаблон достижения не найден")
    
    if template.deleted:
        raise HTTPException(status_code=400, detail="Нельзя выдать удаленное достижение")
    
    # Проверка прав для преподавателя
    if current_user.role == "teacher":
        # Преподаватель может выдавать:
        # 1. Публичные достижения (is_public=True) - любые
        # 2. Достижения по своим курсам (course_id принадлежит преподавателю)
        if template.is_public:
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
        
        # Проверяем, что все студенты учатся на курсах преподавателя
        teacher_courses = db.query(CourseTeacher.course_id).filter(
            CourseTeacher.teacher_id == current_user.teacher_id
        ).all()
        course_ids = [c[0] for c in teacher_courses]
        
        if not course_ids:
            raise HTTPException(status_code=403, detail="У вас нет курсов для выдачи достижений")
        
        # Проверяем, что все выбранные студенты имеют оценки по курсам преподавателя
        valid_students = db.query(Grade.student_id).filter(
            Grade.course_id.in_(course_ids),
            Grade.student_id.in_(student_ids)
        ).distinct().all()
        valid_student_ids = [s[0] for s in valid_students]
        
        # Проверяем, что все выбранные студенты валидны
        invalid_students = set(student_ids) - set(valid_student_ids)
        if invalid_students:
            raise HTTPException(
                status_code=403, 
                detail=f"Вы не можете выдать достижение студентам, у которых не ведете предметы. Невалидные студенты: {len(invalid_students)}"
            )
    
    created_count = 0
    
    for student_id in student_ids:
        # Проверяем, нет ли уже такой связи
        existing = db.query(StudentAchievement).filter(
            StudentAchievement.student_id == student_id,
            StudentAchievement.achievement_template_id == achievement_template_id
        ).first()
        
        if not existing:
            student_achievement = StudentAchievement(
                student_id=student_id,
                achievement_template_id=achievement_template_id
            )
            db.add(student_achievement)
            created_count += 1
    
    db.commit()
    
    return {
        "message": f"Достижение выдано {created_count} студентам",
        "created_count": created_count
    }

