"""
Модуль для генерации ИИ-советов с использованием YandexGPT API
"""
import os
from pathlib import Path
from dotenv import load_dotenv
import requests
from typing import Dict
from sqlalchemy.orm import Session
from app.models import Student, Grade, Attendance, Course, Teacher, CourseTeacher
from datetime import date, timedelta
from sqlalchemy import func, case

# Загружаем переменные окружения из .env файла
# Ищем .env в корне проекта (на уровень выше backend/)
env_path = Path(__file__).parent.parent.parent / '.env'
if env_path.exists():
    load_dotenv(env_path)
else:
    # Если не найден в корне, пробуем в текущей директории
    load_dotenv()

# Конфигурация YandexGPT API из переменных окружения
YANDEX_API_KEY = os.getenv("YANDEX_API_KEY", "")
YANDEX_FOLDER_ID = os.getenv("YANDEX_FOLDER_ID", "")
YANDEX_API_URL = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"

# Выбор модели YandexGPT:
# - "yandexgpt/latest" - стандартная модель (рекомендуется для большинства задач)
# - "yandexgpt-lite/latest" - легкая модель, быстрее и дешевле, но менее точная
# - "yandexgpt-pro/latest" - продвинутая модель, лучше качество, но дороже и медленнее
# Для образовательных советов рекомендуется "yandexgpt/latest" - оптимальный баланс
YANDEX_MODEL = os.getenv("YANDEX_MODEL", "yandexgpt/latest")

# Если API ключ не установлен, используем моковые советы
USE_MOCK = not YANDEX_API_KEY or not YANDEX_FOLDER_ID


def prepare_student_context(db: Session, student_id: int) -> Dict:
    """Подготовка контекста о студенте для ИИ"""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        return {}
    
    # Статистика оценок
    grades = db.query(Grade).filter(Grade.student_id == student_id).all()
    avg_grade = db.query(func.avg(Grade.value)).filter(
        Grade.student_id == student_id
    ).scalar() or 0.0
    
    recent_grades = db.query(Grade).filter(
        Grade.student_id == student_id,
        Grade.date >= date.today() - timedelta(days=30)
    ).all()
    
    # Статистика посещаемости
    total_attendance = db.query(Attendance.id).filter(
        Attendance.student_id == student_id,
        Attendance.date >= date.today() - timedelta(days=30)
    ).count()
    present_attendance = db.query(Attendance.id).filter(
        Attendance.student_id == student_id,
        Attendance.date >= date.today() - timedelta(days=30),
        Attendance.present == True
    ).count()
    attendance_rate = (present_attendance / total_attendance * 100) if total_attendance > 0 else 0
    
    # Оценки по курсам
    courses_stats = []
    courses = db.query(Course).join(Grade).filter(Grade.student_id == student_id).distinct().all()
    for course in courses:
        course_grades = [g.value for g in grades if g.course_id == course.id]
        if course_grades:
            courses_stats.append({
                "course": course.name,
                "average": sum(course_grades) / len(course_grades),
                "count": len(course_grades)
            })
    
    # Тренд оценок
    trend = "стабильный"
    if len(recent_grades) >= 5:
        recent_avg = sum(g.value for g in recent_grades) / len(recent_grades)
        older_grades = db.query(Grade).filter(
            Grade.student_id == student_id,
            Grade.date < date.today() - timedelta(days=30),
            Grade.date >= date.today() - timedelta(days=60)
        ).all()
        if older_grades:
            older_avg = sum(g.value for g in older_grades) / len(older_grades)
            if recent_avg > older_avg + 0.3:
                trend = "улучшается"
            elif recent_avg < older_avg - 0.3:
                trend = "ухудшается"
    
    return {
        "name": student.name,
        "group": student.group or "не указана",
        "year": student.year or "не указан",
        "gpa": round(avg_grade, 2),
        "attendance_rate": round(attendance_rate, 1),
        "total_grades": len(grades),
        "recent_grades_count": len(recent_grades),
        "trend": trend,
        "courses": courses_stats,
        "problems": []
    }


def prepare_teacher_context(db: Session, teacher_id: int) -> Dict:
    """Подготовка контекста о преподавателе для ИИ с анализом групп"""
    teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
    if not teacher:
        return {}
    
    # Курсы преподавателя
    courses = db.query(Course).join(CourseTeacher).filter(
        CourseTeacher.teacher_id == teacher_id
    ).all()
    
    courses_stats = []
    groups_stats = {}  # Статистика по группам
    
    for course in courses:
        # Статистика по курсу
        grades = db.query(Grade).filter(Grade.course_id == course.id).all()
        avg_grade = db.query(func.avg(Grade.value)).filter(
            Grade.course_id == course.id
        ).scalar() or 0.0
        
        # Посещаемость по курсу
        total_attendance = db.query(Attendance.id).filter(
            Attendance.course_id == course.id,
            Attendance.date >= date.today() - timedelta(days=30)
        ).count()
        present_attendance = db.query(Attendance.id).filter(
            Attendance.course_id == course.id,
            Attendance.date >= date.today() - timedelta(days=30),
            Attendance.present == True
        ).count()
        attendance_rate = (present_attendance / total_attendance * 100) if total_attendance > 0 else 0
        
        courses_stats.append({
            "course": course.name,
            "average_grade": round(avg_grade, 2),
            "attendance_rate": round(attendance_rate, 1),
            "total_students": len(set(g.student_id for g in grades))
        })
        
        # Собираем статистику по группам для этого курса
        # Получаем студентов, которые изучают этот курс
        student_ids = set(g.student_id for g in grades)
        students = db.query(Student).filter(Student.id.in_(student_ids)).all() if student_ids else []
        
        for student in students:
            group_name = student.group or "Без группы"
            if group_name not in groups_stats:
                groups_stats[group_name] = {
                    "groups": [],
                    "total_students": 0,
                    "total_grades": 0,
                    "grades_sum": 0.0,
                    "total_attendance": 0,
                    "present_attendance": 0,
                    "courses": set()
                }
            
            groups_stats[group_name]["total_students"] += 1
            groups_stats[group_name]["courses"].add(course.name)
            
            # Оценки студентов этой группы по этому курсу
            group_grades = [g for g in grades if g.student_id == student.id]
            groups_stats[group_name]["total_grades"] += len(group_grades)
            groups_stats[group_name]["grades_sum"] += sum(g.value for g in group_grades)
            
            # Посещаемость студентов этой группы по этому курсу
            group_attendance = db.query(Attendance.id).filter(
                Attendance.student_id == student.id,
                Attendance.course_id == course.id,
                Attendance.date >= date.today() - timedelta(days=30)
            ).count()
            group_present = db.query(Attendance.id).filter(
                Attendance.student_id == student.id,
                Attendance.course_id == course.id,
                Attendance.date >= date.today() - timedelta(days=30),
                Attendance.present == True
            ).count()
            
            groups_stats[group_name]["total_attendance"] += group_attendance
            groups_stats[group_name]["present_attendance"] += group_present
    
    # Формируем финальную статистику по группам
    groups_final = []
    for group_name, stats in groups_stats.items():
        avg_grade = (stats["grades_sum"] / stats["total_grades"]) if stats["total_grades"] > 0 else 0.0
        attendance_rate = (stats["present_attendance"] / stats["total_attendance"] * 100) if stats["total_attendance"] > 0 else 0
        
        # Определяем проблемность группы
        is_problem = False
        problem_score = 0
        if avg_grade > 0 and avg_grade < 3.5:
            is_problem = True
            problem_score += (3.5 - avg_grade) * 10  # Чем ниже балл, тем выше приоритет
        if attendance_rate < 70:
            is_problem = True
            problem_score += (70 - attendance_rate)  # Чем ниже посещаемость, тем выше приоритет
        
        groups_final.append({
            "group": group_name,
            "average_grade": round(avg_grade, 2),
            "attendance_rate": round(attendance_rate, 1),
            "total_students": stats["total_students"],
            "courses": list(stats["courses"]),
            "is_problem": is_problem,
            "problem_score": problem_score
        })
    
    # Сортируем группы: сначала проблемные (по приоритету проблемности), потом остальные
    groups_final.sort(key=lambda g: (
        not g["is_problem"],  # Проблемные группы сначала (False < True)
        -g["problem_score"],  # По убыванию проблемности
        g["average_grade"] if g["average_grade"] > 0 else 5,  # Затем по среднему баллу
        100 - g["attendance_rate"]  # Затем по посещаемости
    ))
    
    return {
        "name": teacher.name,
        "department": teacher.department or "не указана",
        "courses_count": len(courses),
        "courses": courses_stats,
        "groups": groups_final
    }


def generate_student_advice_yandex(context: Dict, advice_type: str = "pleasant") -> str:
    """
    Генерация совета для студента через YandexGPT
    
    Args:
        context: Контекст со статистикой студента
        advice_type: Тип совета - "pleasant" (приятный) или "useful" (полезный)
    """
    if USE_MOCK:
        return generate_student_advice_mock(context, advice_type)
    
    if advice_type == "useful":
        # Полезный совет - детальный анализ по предметам
        prompt = f"""Ты - образовательный консультант. Проанализируй данные студента и дай детальный полезный совет с конкретными рекомендациями по каждому предмету.

Данные студента:
- Имя: {context.get('name', 'Не указано')}
- Группа: {context.get('group', 'Не указана')}
- Курс: {context.get('year', 'Не указан')}
- Средний балл (GPA): {context.get('gpa', 0)}
- Посещаемость: {context.get('attendance_rate', 0)}%
- Тренд успеваемости: {context.get('trend', 'стабильный')}

Детальная статистика по предметам:
"""
        
        for course in context.get('courses', []):
            avg = course['average']
            count = course['count']
            status = "отлично" if avg >= 4.5 else "хорошо" if avg >= 3.5 else "удовлетворительно" if avg >= 3.0 else "требует внимания"
            prompt += f"- {course['course']}: средний балл {avg:.2f} ({status}), оценок {count}\n"
        
        prompt += """
Дай детальный полезный совет на русском языке (4-6 предложений):
1. Начни с общего анализа успеваемости
2. Укажи предметы, которые требуют особого внимания (низкий средний балл)
3. Для каждого проблемного предмета предложи конкретные действия (что именно нужно подтянуть, как улучшить)
4. Если есть предметы с хорошей успеваемостью, отметь их как сильные стороны
5. Дай конкретные рекомендации по улучшению

Формат: структурированный текст с четкими рекомендациями."""
    else:
        # Приятный совет - мотивирующий общий совет
        prompt = f"""Ты - образовательный консультант. Проанализируй данные студента и дай мотивирующий приятный совет.

Данные студента:
- Имя: {context.get('name', 'Не указано')}
- Группа: {context.get('group', 'Не указана')}
- Курс: {context.get('year', 'Не указан')}
- Средний балл (GPA): {context.get('gpa', 0)}
- Посещаемость: {context.get('attendance_rate', 0)}%
- Всего оценок: {context.get('total_grades', 0)}
- Тренд успеваемости: {context.get('trend', 'стабильный')}

Оценки по курсам:
"""
        
        for course in context.get('courses', []):
            prompt += f"- {course['course']}: средний балл {course['average']:.2f}, оценок {course['count']}\n"
        
        prompt += """
Дай краткий, мотивирующий и приятный совет (2-3 предложения) на русском языке. 
Сосредоточься на позитивных моментах, похвали за успехи, мягко предложи улучшения.
Если успеваемость хорошая, похвали и предложи как поддерживать высокий уровень.
Тон должен быть дружелюбным и поддерживающим."""
    
    try:
        response = requests.post(
            YANDEX_API_URL,
            headers={
                "Authorization": f"Api-Key {YANDEX_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "modelUri": f"gpt://{YANDEX_FOLDER_ID}/{YANDEX_MODEL}",
                "completionOptions": {
                    "stream": False,
                    "temperature": 0.6,
                    "maxTokens": 200
                },
                "messages": [
                    {
                        "role": "user",
                        "text": prompt
                    }
                ]
            },
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            return result.get("result", {}).get("alternatives", [{}])[0].get("message", {}).get("text", "")
        else:
            print(f"YandexGPT API error: {response.status_code} - {response.text}")
            return generate_student_advice_mock(context, advice_type)
    except Exception as e:
        print(f"Error calling YandexGPT: {e}")
        return generate_student_advice_mock(context, advice_type)


def generate_teacher_advice_yandex(context: Dict) -> str:
    """Генерация совета для преподавателя через YandexGPT с анализом групп"""
    if USE_MOCK:
        return generate_teacher_advice_mock(context)
    
    # Формируем промпт
    prompt = f"""Ты - консультант по образовательным технологиям. Проанализируй данные преподавателя и дай детальный совет с указанием групп, требующих внимания.

Данные преподавателя:
- Имя: {context.get('name', 'Не указано')}
- Кафедра: {context.get('department', 'Не указана')}
- Количество курсов: {context.get('courses_count', 0)}

Статистика по курсам:
"""
    
    for course in context.get('courses', []):
        prompt += f"- {course['course']}: средний балл {course['average_grade']:.2f}, посещаемость {course['attendance_rate']:.1f}%, студентов {course['total_students']}\n"
    
    prompt += "\nСтатистика по группам (отсортированы по проблемности):\n"
    
    groups = context.get('groups', [])
    problem_groups = []
    good_groups = []
    
    for group in groups:
        status = []
        is_problem = False
        if group['average_grade'] > 0 and group['average_grade'] < 3.5:
            status.append("низкий средний балл")
            is_problem = True
        if group['attendance_rate'] < 70:
            status.append("низкая посещаемость")
            is_problem = True
        
        if is_problem:
            problem_groups.append(group)
            status_str = f" ⚠️ ПРОБЛЕМА: {', '.join(status)}"
        else:
            good_groups.append(group)
            status_str = " ✓ хорошие показатели"
        
        prompt += f"- **Группа {group['group']}**: средний балл {group['average_grade']:.2f}, посещаемость {group['attendance_rate']:.1f}%, студентов {group['total_students']}{status_str}\n"
    
    prompt += f"\nВсего проблемных групп: {len(problem_groups)}, групп с хорошими показателями: {len(good_groups)}\n"
    
    prompt += """
Дай детальный полезный совет на русском языке (5-8 предложений):
1. Начни с общего анализа эффективности преподавания на основе статистики по курсам
2. **ОБЯЗАТЕЛЬНО** укажи конкретные названия групп, которые требуют особого внимания (низкий средний балл < 3.5 или низкая посещаемость < 70%)
3. Для каждой проблемной группы предложи конкретные действия:
   - Если низкая посещаемость: как мотивировать студентов посещать занятия
   - Если низкий средний балл: какие темы нужно разобрать дополнительно, как помочь студентам
4. Если есть группы с хорошими показателями, отметь их как пример успешной работы
5. Дай общие рекомендации по улучшению работы с проблемными группами

ВАЖНО: Обязательно упомяни конкретные названия групп в тексте совета. Используй markdown для форматирования (жирный текст для названий групп **Группа X**, списки для рекомендаций)."""
    
    try:
        response = requests.post(
            YANDEX_API_URL,
            headers={
                "Authorization": f"Api-Key {YANDEX_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "modelUri": f"gpt://{YANDEX_FOLDER_ID}/{YANDEX_MODEL}",
                "completionOptions": {
                    "stream": False,
                    "temperature": 0.6,
                    "maxTokens": 500
                },
                "messages": [
                    {
                        "role": "user",
                        "text": prompt
                    }
                ]
            },
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            return result.get("result", {}).get("alternatives", [{}])[0].get("message", {}).get("text", "")
        else:
            print(f"YandexGPT API error: {response.status_code} - {response.text}")
            return generate_teacher_advice_mock(context)
    except Exception as e:
        print(f"Error calling YandexGPT: {e}")
        return generate_teacher_advice_mock(context)


def generate_student_advice_mock(context: Dict, advice_type: str = "pleasant") -> str:
    """Генерация мокового совета для студента (если API недоступен)"""
    gpa = context.get('gpa', 0)
    attendance = context.get('attendance_rate', 0)
    trend = context.get('trend', 'стабильный')
    courses = context.get('courses', [])
    
    if advice_type == "useful":
        # Полезный совет - детальный анализ
        problem_courses = [c for c in courses if c.get('average', 5) < 3.5]
        good_courses = [c for c in courses if c.get('average', 0) >= 4.0]
        
        advice_parts = []
        
        # Общий анализ
        if gpa >= 4.5:
            advice_parts.append(f"Отличная общая успеваемость! Ваш средний балл {gpa:.2f} показывает высокий уровень знаний.")
        elif gpa >= 3.5:
            advice_parts.append(f"Хорошая успеваемость со средним баллом {gpa:.2f}. Есть потенциал для улучшения.")
        else:
            advice_parts.append(f"Ваш средний балл {gpa:.2f} ниже желаемого уровня. Требуется усиленная работа.")
        
        # Анализ проблемных предметов
        if problem_courses:
            advice_parts.append("\nПредметы, требующие особого внимания:")
            for course in problem_courses[:3]:  # Показываем до 3 проблемных предметов
                avg = course['average']
                course_name = course['course']
                if avg < 3.0:
                    advice_parts.append(f"- {course_name} (средний балл {avg:.2f}): требуется серьезная работа. Рекомендую обратиться к преподавателю за консультацией, пересмотреть конспекты и выполнить дополнительные задания.")
                else:
                    advice_parts.append(f"- {course_name} (средний балл {avg:.2f}): нужно подтянуть. Уделите больше времени подготовке, регулярно выполняйте домашние задания.")
        
        # Сильные стороны
        if good_courses:
            advice_parts.append(f"\nСильные стороны: отличные результаты по {', '.join([c['course'] for c in good_courses[:3]])}. Продолжайте поддерживать этот уровень.")
        
        # Посещаемость
        if attendance < 70:
            advice_parts.append(f"\nПосещаемость {attendance:.1f}% ниже нормы. Регулярное посещение занятий критически важно для успешного обучения.")
        
        return " ".join(advice_parts) if advice_parts else "Продолжайте работать над улучшением успеваемости."
    else:
        # Приятный совет - мотивирующий
        if gpa < 3.0:
            return "Ваш средний балл ниже среднего. Рекомендую уделить больше времени подготовке к занятиям, регулярно выполнять домашние задания и обращаться за помощью к преподавателям при возникновении вопросов. Составьте план обучения и следуйте ему."
        elif gpa < 3.5:
            return "Ваша успеваемость на среднем уровне. Для улучшения результатов рекомендую более активно участвовать на занятиях, задавать вопросы и работать над слабыми местами. Регулярное повторение материала поможет закрепить знания."
        elif attendance < 70:
            return f"Ваша посещаемость составляет {attendance:.1f}%, что ниже рекомендуемого уровня. Регулярное посещение занятий критически важно для успешного обучения. Постарайтесь не пропускать пары и активно участвовать в учебном процессе."
        elif trend == "ухудшается":
            return "Замечено снижение успеваемости в последнее время. Рекомендую проанализировать причины и скорректировать подход к обучению. Возможно, стоит пересмотреть расписание и выделить больше времени на подготовку."
        elif gpa >= 4.5:
            return f"{context.get('name', 'Вы')}, у вас отличная успеваемость и стабильный тренд! Продолжайте в том же духе. Чтобы улучшить посещаемость, попробуйте планировать свой график заранее и выделять время не только на учёбу, но и на отдых, чтобы поддерживать высокий уровень энергии и концентрации на занятиях."
        else:
            return f"{context.get('name', 'Вы')}, у вас хорошая успеваемость! Продолжайте поддерживать активность на занятиях и помогайте одногруппникам. Для дальнейшего улучшения рекомендую углубленно изучать интересующие темы и участвовать в дополнительных активностях."


def generate_teacher_advice_mock(context: Dict) -> str:
    """Генерация мокового совета для преподавателя с анализом групп"""
    courses = context.get('courses', [])
    groups = context.get('groups', [])
    
    if not courses:
        return "У вас пока нет курсов с данными. После начала работы со студентами здесь появятся персональные рекомендации."
    
    advice_parts = []
    
    # Общий анализ
    total_students = sum(c.get('total_students', 0) for c in courses)
    overall_avg = sum(c.get('average_grade', 0) * c.get('total_students', 0) for c in courses) / total_students if total_students > 0 else 0
    overall_attendance = sum(c.get('attendance_rate', 0) * c.get('total_students', 0) for c in courses) / total_students if total_students > 0 else 0
    
    if overall_avg >= 4.0 and overall_attendance >= 80:
        advice_parts.append(f"Отличная общая эффективность преподавания! Средний балл {overall_avg:.2f} и посещаемость {overall_attendance:.1f}% показывают высокий уровень работы со студентами.")
    elif overall_avg >= 3.5:
        advice_parts.append(f"Хорошая эффективность преподавания со средним баллом {overall_avg:.2f}. Есть потенциал для улучшения.")
    else:
        advice_parts.append(f"Требуется внимание к эффективности преподавания. Средний балл {overall_avg:.2f} ниже желаемого уровня.")
    
    # Анализ проблемных групп (группы уже отсортированы по проблемности)
    problem_groups = [g for g in groups if (g.get('average_grade', 5) > 0 and g.get('average_grade', 5) < 3.5) or g.get('attendance_rate', 100) < 70]
    
    if problem_groups:
        advice_parts.append("\n**Группы, требующие особого внимания:**")
        for group in problem_groups[:5]:  # Показываем до 5 проблемных групп
            group_name = group['group']
            avg = group['average_grade']
            attendance = group['attendance_rate']
            students_count = group['total_students']
            
            problems = []
            recommendations = []
            
            if avg > 0 and avg < 3.5:
                problems.append(f"низкий средний балл ({avg:.2f})")
                recommendations.append("провести дополнительные консультации")
                recommendations.append("разобрать сложные темы более детально")
                recommendations.append("предложить дополнительные материалы для самостоятельного изучения")
            
            if attendance < 70:
                problems.append(f"низкая посещаемость ({attendance:.1f}%)")
                recommendations.append("связаться со старостой группы")
                recommendations.append("использовать интерактивные методы обучения")
                recommendations.append("рассмотреть возможность онлайн-консультаций")
            
            if problems:
                problems_str = ', '.join(problems)
                rec_str = ', '.join(recommendations[:3])  # Берем первые 3 рекомендации
                advice_parts.append(f"- **Группа {group_name}** ({students_count} студентов): {problems_str}. Рекомендуется {rec_str}.")
    
    # Группы с хорошими показателями
    good_groups = [g for g in groups if g.get('average_grade', 0) >= 4.0 and g.get('attendance_rate', 0) >= 80]
    if good_groups:
        group_names = ", ".join([f"**{g['group']}**" for g in good_groups[:3]])
        advice_parts.append(f"\n**Сильные стороны:** отличные результаты в группах {group_names}. Используйте их опыт для работы с другими группами.")
    
    # Общие рекомендации
    if problem_groups:
        advice_parts.append("\n**Общие рекомендации:**")
        has_low_attendance = any(g.get('attendance_rate', 100) < 70 for g in problem_groups)
        has_low_grades = any(g.get('average_grade', 5) > 0 and g.get('average_grade', 5) < 3.5 for g in problem_groups)
        
        if has_low_attendance:
            advice_parts.append("- Для групп с низкой посещаемостью: мотивируйте студентов через интересные задания, свяжитесь со старостами для выяснения причин пропусков, рассмотрите возможность записи лекций для студентов, которые пропустили занятия.")
        if has_low_grades:
            advice_parts.append("- Для групп с низким средним баллом: проведите диагностику знаний, выявите проблемные темы, организуйте дополнительные занятия по сложным разделам, предложите индивидуальные консультации для отстающих студентов.")
    else:
        advice_parts.append("\nПродолжайте использовать эффективные методы преподавания и поддерживайте высокий уровень вовлеченности студентов.")
    
    return "\n\n".join(advice_parts) if advice_parts else "Продолжайте работать над улучшением эффективности преподавания."


def get_student_advice(db: Session, student_id: int, advice_type: str = "pleasant") -> str:
    """
    Получение совета для студента
    
    Args:
        db: Сессия базы данных
        student_id: ID студента
        advice_type: Тип совета - "pleasant" (приятный) или "useful" (полезный)
    """
    context = prepare_student_context(db, student_id)
    return generate_student_advice_yandex(context, advice_type)


def get_teacher_advice(db: Session, teacher_id: int) -> str:
    """Получение совета для преподавателя"""
    context = prepare_teacher_context(db, teacher_id)
    return generate_teacher_advice_yandex(context)


def prepare_student_course_context(db: Session, student_id: int, course_id: int) -> Dict:
    """Подготовка контекста о студенте по конкретному курсу для ИИ"""
    student = db.query(Student).filter(Student.id == student_id).first()
    course = db.query(Course).filter(Course.id == course_id).first()
    
    if not student or not course:
        return {}
    
    # Оценки по этому курсу (сортируем по дате или по дате создания)
    course_grades_all = db.query(Grade).filter(
        Grade.student_id == student_id,
        Grade.course_id == course_id
    ).all()
    # Сортируем: сначала по дате оценки (если есть), потом по ID (как запасной вариант)
    course_grades = sorted(
        course_grades_all,
        key=lambda g: (g.date if g.date else date.min, g.id),
        reverse=True
    )
    
    avg_grade = db.query(func.avg(Grade.value)).filter(
        Grade.student_id == student_id,
        Grade.course_id == course_id
    ).scalar() or 0.0
    
    # Посещаемость по этому курсу
    total_attendance = db.query(Attendance.id).filter(
        Attendance.student_id == student_id,
        Attendance.course_id == course_id,
        Attendance.date >= date.today() - timedelta(days=60)
    ).count()
    present_attendance = db.query(Attendance.id).filter(
        Attendance.student_id == student_id,
        Attendance.course_id == course_id,
        Attendance.date >= date.today() - timedelta(days=60),
        Attendance.present == True
    ).count()
    attendance_rate = (present_attendance / total_attendance * 100) if total_attendance > 0 else 0
    
    # Тренд оценок по курсу
    trend = "стабильный"
    if len(course_grades) >= 3:
        recent_grades = course_grades[:min(5, len(course_grades))]
        older_grades = course_grades[min(5, len(course_grades)):min(10, len(course_grades))]
        if older_grades:
            recent_avg = sum(g.value for g in recent_grades) / len(recent_grades)
            older_avg = sum(g.value for g in older_grades) / len(older_grades)
            if recent_avg > older_avg + 0.3:
                trend = "улучшается"
            elif recent_avg < older_avg - 0.3:
                trend = "ухудшается"
    
    # Типы оценок по курсу
    grade_types = {}
    for grade in course_grades:
        grade_type = grade.type or "Другое"
        if grade_type not in grade_types:
            grade_types[grade_type] = []
        grade_types[grade_type].append(grade.value)
    
    grade_types_stats = {
        gtype: {
            "average": sum(values) / len(values),
            "count": len(values)
        }
        for gtype, values in grade_types.items()
    }
    
    return {
        "name": student.name,
        "course_name": course.name,
        "course_code": course.code or "",
        "gpa": round(avg_grade, 2),
        "attendance_rate": round(attendance_rate, 1),
        "total_grades": len(course_grades),
        "trend": trend,
        "grade_types": grade_types_stats,
        "recent_grades": [g.value for g in course_grades[:5]]
    }


def generate_student_course_advice_yandex(context: Dict) -> str:
    """Генерация совета для студента по конкретному курсу через YandexGPT"""
    if USE_MOCK:
        return generate_student_course_advice_mock(context)
    
    # Формируем промпт
    prompt = f"""Ты - образовательный консультант. Проанализируй успеваемость студента по конкретному предмету и дай детальный полезный совет.

Данные студента:
- Имя: {context.get('name', 'Не указано')}
- Предмет: {context.get('course_name', 'Не указан')} {f"({context.get('course_code', '')})" if context.get('course_code') else ''}
- Средний балл по предмету: {context.get('gpa', 0)}
- Посещаемость: {context.get('attendance_rate', 0)}%
- Всего оценок: {context.get('total_grades', 0)}
- Тренд успеваемости: {context.get('trend', 'стабильный')}

Последние оценки: {', '.join([str(g) for g in context.get('recent_grades', [])[:5]])}

Статистика по типам оценок:
"""
    
    for grade_type, stats in context.get('grade_types', {}).items():
        prompt += f"- {grade_type}: средний балл {stats['average']:.2f}, оценок {stats['count']}\n"
    
    prompt += """
Дай детальный полезный совет на русском языке (4-6 предложений):
1. Начни с анализа текущей успеваемости по предмету
2. Укажи конкретные проблемы (если есть) - низкие оценки, пропуски, слабые типы заданий
3. Предложи конкретные действия для улучшения (что именно нужно подтянуть, как готовиться)
4. Если успеваемость хорошая, отметь сильные стороны и предложи как поддерживать уровень
5. Дай мотивирующее заключение

Формат: структурированный текст с четкими рекомендациями. Используй markdown для форматирования (жирный текст для названий тем, списки для рекомендаций)."""
    
    try:
        response = requests.post(
            YANDEX_API_URL,
            headers={
                "Authorization": f"Api-Key {YANDEX_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "modelUri": f"gpt://{YANDEX_FOLDER_ID}/{YANDEX_MODEL}",
                "completionOptions": {
                    "stream": False,
                    "temperature": 0.6,
                    "maxTokens": 400
                },
                "messages": [
                    {
                        "role": "user",
                        "text": prompt
                    }
                ]
            },
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            return result.get("result", {}).get("alternatives", [{}])[0].get("message", {}).get("text", "")
        else:
            print(f"YandexGPT API error: {response.status_code} - {response.text}")
            return generate_student_course_advice_mock(context)
    except Exception as e:
        print(f"Error calling YandexGPT: {e}")
        return generate_student_course_advice_mock(context)


def generate_student_course_advice_mock(context: Dict) -> str:
    """Генерация мокового совета для студента по курсу"""
    gpa = context.get('gpa', 0)
    attendance = context.get('attendance_rate', 0)
    trend = context.get('trend', 'стабильный')
    course_name = context.get('course_name', 'предмету')
    grade_types = context.get('grade_types', {})
    
    advice_parts = []
    
    # Общий анализ
    if gpa >= 4.5:
        advice_parts.append(f"Отличная успеваемость по предмету **{course_name}**! Ваш средний балл {gpa:.2f} показывает высокий уровень знаний.")
    elif gpa >= 3.5:
        advice_parts.append(f"Хорошая успеваемость по **{course_name}** со средним баллом {gpa:.2f}. Есть потенциал для улучшения.")
    elif gpa >= 3.0:
        advice_parts.append(f"Удовлетворительная успеваемость по **{course_name}** (средний балл {gpa:.2f}). Требуется больше усилий для улучшения.")
    else:
        advice_parts.append(f"Низкая успеваемость по **{course_name}** (средний балл {gpa:.2f}). Необходима серьезная работа над предметом.")
    
    # Анализ по типам оценок
    problem_types = [gtype for gtype, stats in grade_types.items() if stats['average'] < 3.5]
    if problem_types:
        advice_parts.append(f"\nТребуют внимания следующие типы заданий:")
        for gtype in problem_types[:3]:
            avg = grade_types[gtype]['average']
            advice_parts.append(f"- **{gtype}** (средний балл {avg:.2f}): рекомендуется больше времени уделять подготовке к таким заданиям, обращаться за помощью к преподавателю.")
    
    # Посещаемость
    if attendance < 70:
        advice_parts.append(f"\nПосещаемость занятий по предмету составляет {attendance:.1f}%, что ниже нормы. Регулярное посещение критически важно для успешного освоения материала.")
    
    # Тренд
    if trend == "ухудшается":
        advice_parts.append(f"\nЗамечено снижение успеваемости в последнее время. Рекомендуется проанализировать причины и усилить подготовку.")
    elif trend == "улучшается":
        advice_parts.append(f"\nОтличная динамика! Успеваемость улучшается. Продолжайте в том же духе!")
    
    return "\n\n".join(advice_parts) if advice_parts else f"Продолжайте работать над улучшением успеваемости по {course_name}."


def get_student_course_advice(db: Session, student_id: int, course_id: int) -> str:
    """Получение совета для студента по конкретному курсу"""
    context = prepare_student_course_context(db, student_id, course_id)
    return generate_student_course_advice_yandex(context)


def prepare_admin_context(db: Session, query: str = "") -> Dict:
    """Подготовка контекста для админа с анализом проблемных студентов, групп и преподавателей"""
    
    # Студенты с низкой успеваемостью (< 3.5) или низкой посещаемостью (< 70%)
    students_with_grades = db.query(
        Student.id,
        Student.name,
        Student.group,
        Student.email,
        func.avg(Grade.value).label('avg_grade'),
        func.count(Grade.id).label('grades_count')
    ).join(Grade, Grade.student_id == Student.id).group_by(Student.id).all()
    
    # Посещаемость студентов за последние 30 дней
    students_attendance = db.query(
        Student.id,
        func.count(Attendance.id).label('total_attendance'),
        func.sum(case((Attendance.present == True, 1), else_=0)).label('present_attendance')
    ).join(Attendance, Attendance.student_id == Student.id).filter(
        Attendance.date >= date.today() - timedelta(days=30)
    ).group_by(Student.id).all()
    
    attendance_dict = {
        s.id: {
            'total': s.total_attendance or 0,
            'present': s.present_attendance or 0,
            'rate': (s.present_attendance / s.total_attendance * 100) if s.total_attendance > 0 else 0
        }
        for s in students_attendance
    }
    
    problem_students = []
    for student in students_with_grades:
        student_id = student.id
        avg_grade = float(student.avg_grade) if student.avg_grade else 0.0
        attendance_info = attendance_dict.get(student_id, {'rate': 0})
        attendance_rate = attendance_info['rate']
        
        if avg_grade < 3.5 or attendance_rate < 70:
            problem_students.append({
                'id': student_id,
                'name': student.name,
                'group': student.group or 'Без группы',
                'email': student.email,
                'average_grade': round(avg_grade, 2),
                'attendance_rate': round(attendance_rate, 1),
                'grades_count': student.grades_count
            })
    
    # Сортируем по проблемности
    problem_students.sort(key=lambda s: (
        s['average_grade'] if s['average_grade'] > 0 else 5,
        100 - s['attendance_rate']
    ))
    
    # Группы с проблемами
    groups_stats = {}
    all_students = db.query(Student).all()
    
    for student in all_students:
        group_name = student.group or 'Без группы'
        if group_name not in groups_stats:
            groups_stats[group_name] = {
                'students': [],
                'total_grades': 0,
                'grades_sum': 0.0,
                'total_attendance': 0,
                'present_attendance': 0
            }
        groups_stats[group_name]['students'].append(student.id)
    
    # Подсчитываем статистику по группам
    for group_name, stats in groups_stats.items():
        student_ids = stats['students']
        
        # Средний балл группы
        avg_grade_query = db.query(func.avg(Grade.value)).filter(
            Grade.student_id.in_(student_ids)
        ).scalar()
        stats['average_grade'] = round(float(avg_grade_query) if avg_grade_query else 0.0, 2)
        
        # Посещаемость группы
        attendance_query = db.query(
            func.count(Attendance.id).label('total'),
            func.sum(case((Attendance.present == True, 1), else_=0)).label('present')
        ).filter(
            Attendance.student_id.in_(student_ids),
            Attendance.date >= date.today() - timedelta(days=30)
        ).first()
        
        total_att = attendance_query.total or 0
        present_att = attendance_query.present or 0
        stats['attendance_rate'] = round((present_att / total_att * 100) if total_att > 0 else 0, 1)
        stats['total_students'] = len(student_ids)
    
    problem_groups = [
        {
            'group': group_name,
            'average_grade': stats['average_grade'],
            'attendance_rate': stats['attendance_rate'],
            'total_students': stats['total_students']
        }
        for group_name, stats in groups_stats.items()
        if stats['average_grade'] < 3.5 or stats['attendance_rate'] < 70
    ]
    
    problem_groups.sort(key=lambda g: (
        g['average_grade'] if g['average_grade'] > 0 else 5,
        100 - g['attendance_rate']
    ))
    
    # Преподаватели с проблемами (низкий средний балл по их курсам или низкая посещаемость)
    teachers_stats = []
    teachers = db.query(Teacher).all()
    
    for teacher in teachers:
        # Курсы преподавателя
        courses = db.query(Course).join(CourseTeacher).filter(
            CourseTeacher.teacher_id == teacher.id
        ).all()
        
        if not courses:
            continue
        
        # Средний балл по всем курсам преподавателя
        course_ids = [c.id for c in courses]
        avg_grade_query = db.query(func.avg(Grade.value)).filter(
            Grade.course_id.in_(course_ids)
        ).scalar()
        avg_grade = round(float(avg_grade_query) if avg_grade_query else 0.0, 2)
        
        # Посещаемость по всем курсам преподавателя
        attendance_query = db.query(
            func.count(Attendance.id).label('total'),
            func.sum(case((Attendance.present == True, 1), else_=0)).label('present')
        ).filter(
            Attendance.course_id.in_(course_ids),
            Attendance.date >= date.today() - timedelta(days=30)
        ).first()
        
        total_att = attendance_query.total or 0
        present_att = attendance_query.present or 0
        attendance_rate = round((present_att / total_att * 100) if total_att > 0 else 0, 1)
        
        if avg_grade < 3.5 or attendance_rate < 70:
            teachers_stats.append({
                'id': teacher.id,
                'name': teacher.name,
                'department': teacher.department or 'Не указана',
                'courses_count': len(courses),
                'average_grade': avg_grade,
                'attendance_rate': attendance_rate
            })
    
    teachers_stats.sort(key=lambda t: (
        t['average_grade'] if t['average_grade'] > 0 else 5,
        100 - t['attendance_rate']
    ))
    
    # Общая статистика
    total_students = db.query(Student).count()
    total_teachers = db.query(Teacher).count()
    total_courses = db.query(Course).count()
    
    overall_avg_grade = db.query(func.avg(Grade.value)).scalar()
    overall_avg_grade = round(float(overall_avg_grade) if overall_avg_grade else 0.0, 2)
    
    overall_attendance_query = db.query(
        func.count(Attendance.id).label('total'),
        func.sum(case((Attendance.present == True, 1), else_=0)).label('present')
    ).filter(
        Attendance.date >= date.today() - timedelta(days=30)
    ).first()
    
    overall_total_att = overall_attendance_query.total or 0
    overall_present_att = overall_attendance_query.present or 0
    overall_attendance_rate = round((overall_present_att / overall_total_att * 100) if overall_total_att > 0 else 0, 1)
    
    return {
        'query': query,
        'total_students': total_students,
        'total_teachers': total_teachers,
        'total_courses': total_courses,
        'overall_average_grade': overall_avg_grade,
        'overall_attendance_rate': overall_attendance_rate,
        'problem_students': problem_students[:20],  # Топ 20 проблемных студентов
        'problem_groups': problem_groups[:15],  # Топ 15 проблемных групп
        'problem_teachers': teachers_stats[:10],  # Топ 10 проблемных преподавателей
        'problem_students_count': len(problem_students),
        'problem_groups_count': len(problem_groups),
        'problem_teachers_count': len(teachers_stats)
    }


def generate_admin_advice_yandex(context: Dict) -> str:
    """Генерация ответа для админа через YandexGPT на основе вопроса и контекста"""
    if USE_MOCK:
        return generate_admin_advice_mock(context)
    
    query = context.get('query', '').strip()
    
    # Формируем промпт
    prompt = f"""Ты - ИИ-ассистент администратора образовательной системы. Администратор задал вопрос или запрос, и тебе нужно проанализировать данные и дать полезный ответ.

ВОПРОС/ЗАПРОС АДМИНИСТРАТОРА: {query if query else 'Дай общий анализ проблемных зон в системе'}

ОБЩАЯ СТАТИСТИКА СИСТЕМЫ:
- Всего студентов: {context.get('total_students', 0)}
- Всего преподавателей: {context.get('total_teachers', 0)}
- Всего курсов: {context.get('total_courses', 0)}
- Общий средний балл: {context.get('overall_average_grade', 0):.2f}
- Общая посещаемость: {context.get('overall_attendance_rate', 0):.1f}%

ПРОБЛЕМНЫЕ СТУДЕНТЫ (низкая успеваемость < 3.5 или низкая посещаемость < 70%):
Всего проблемных студентов: {context.get('problem_students_count', 0)}

Топ проблемных студентов:
"""
    
    for i, student in enumerate(context.get('problem_students', [])[:10], 1):
        problems = []
        if student['average_grade'] < 3.5:
            problems.append(f"низкий средний балл ({student['average_grade']:.2f})")
        if student['attendance_rate'] < 70:
            problems.append(f"низкая посещаемость ({student['attendance_rate']:.1f}%)")
        problems_str = ', '.join(problems) if problems else 'нет данных'
        prompt += f"{i}. {student['name']} (группа {student['group']}, email: {student['email']}): {problems_str}\n"
    
    prompt += f"\nПРОБЛЕМНЫЕ ГРУППЫ (низкая успеваемость < 3.5 или низкая посещаемость < 70%):\n"
    prompt += f"Всего проблемных групп: {context.get('problem_groups_count', 0)}\n\n"
    
    for i, group in enumerate(context.get('problem_groups', [])[:10], 1):
        problems = []
        if group['average_grade'] < 3.5:
            problems.append(f"низкий средний балл ({group['average_grade']:.2f})")
        if group['attendance_rate'] < 70:
            problems.append(f"низкая посещаемость ({group['attendance_rate']:.1f}%)")
        problems_str = ', '.join(problems) if problems else 'нет данных'
        prompt += f"{i}. Группа {group['group']} ({group['total_students']} студентов): {problems_str}\n"
    
    prompt += f"\nПРОБЛЕМНЫЕ ПРЕПОДАВАТЕЛИ (низкая успеваемость < 3.5 или низкая посещаемость < 70%):\n"
    prompt += f"Всего проблемных преподавателей: {context.get('problem_teachers_count', 0)}\n\n"
    
    for i, teacher in enumerate(context.get('problem_teachers', [])[:10], 1):
        problems = []
        if teacher['average_grade'] < 3.5:
            problems.append(f"низкий средний балл ({teacher['average_grade']:.2f})")
        if teacher['attendance_rate'] < 70:
            problems.append(f"низкая посещаемость ({teacher['attendance_rate']:.1f}%)")
        problems_str = ', '.join(problems) if problems else 'нет данных'
        prompt += f"{i}. {teacher['name']} (кафедра: {teacher['department']}, курсов: {teacher['courses_count']}): {problems_str}\n"
    
    prompt += """
ИНСТРУКЦИИ:
1. Если администратор задал конкретный вопрос, ответь на него, используя предоставленные данные
2. Если вопрос общий или не задан, дай общий анализ проблемных зон
3. Обязательно упоминай конкретные имена студентов, названия групп и имена преподавателей в ответе
4. Если запрос касается поиска конкретных студентов/групп/преподавателей, используй данные из соответствующих списков
5. Дай конкретные рекомендации по решению выявленных проблем
6. Используй markdown для форматирования (жирный текст для имен, списки для рекомендаций)

Формат ответа: структурированный текст с четкими рекомендациями на русском языке."""
    
    try:
        response = requests.post(
            YANDEX_API_URL,
            headers={
                "Authorization": f"Api-Key {YANDEX_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "modelUri": f"gpt://{YANDEX_FOLDER_ID}/{YANDEX_MODEL}",
                "completionOptions": {
                    "stream": False,
                    "temperature": 0.7,
                    "maxTokens": 1000
                },
                "messages": [
                    {
                        "role": "user",
                        "text": prompt
                    }
                ]
            },
            timeout=15
        )
        
        if response.status_code == 200:
            result = response.json()
            return result.get("result", {}).get("alternatives", [{}])[0].get("message", {}).get("text", "")
        else:
            print(f"YandexGPT API error: {response.status_code} - {response.text}")
            return generate_admin_advice_mock(context)
    except Exception as e:
        print(f"Error calling YandexGPT: {e}")
        return generate_admin_advice_mock(context)


def generate_admin_advice_mock(context: Dict) -> str:
    """Генерация мокового ответа для админа"""
    query = context.get('query', '').strip().lower()
    
    problem_students = context.get('problem_students', [])
    problem_groups = context.get('problem_groups', [])
    problem_teachers = context.get('problem_teachers', [])
    
    advice_parts = []
    
    if query:
        if 'студент' in query or 'ученик' in query:
            if problem_students:
                advice_parts.append("**Студенты с проблемами:**\n")
                for student in problem_students[:5]:
                    problems = []
                    if student['average_grade'] < 3.5:
                        problems.append(f"низкий средний балл ({student['average_grade']:.2f})")
                    if student['attendance_rate'] < 70:
                        problems.append(f"низкая посещаемость ({student['attendance_rate']:.1f}%)")
                    advice_parts.append(f"- **{student['name']}** (группа {student['group']}): {', '.join(problems)}")
            else:
                advice_parts.append("Проблемных студентов не найдено.")
        
        elif 'групп' in query:
            if problem_groups:
                advice_parts.append("**Группы с проблемами:**\n")
                for group in problem_groups[:5]:
                    problems = []
                    if group['average_grade'] < 3.5:
                        problems.append(f"низкий средний балл ({group['average_grade']:.2f})")
                    if group['attendance_rate'] < 70:
                        problems.append(f"низкая посещаемость ({group['attendance_rate']:.1f}%)")
                    advice_parts.append(f"- **Группа {group['group']}** ({group['total_students']} студентов): {', '.join(problems)}")
            else:
                advice_parts.append("Проблемных групп не найдено.")
        
        elif 'преподаватель' in query or 'учитель' in query:
            if problem_teachers:
                advice_parts.append("**Преподаватели с проблемами:**\n")
                for teacher in problem_teachers[:5]:
                    problems = []
                    if teacher['average_grade'] < 3.5:
                        problems.append(f"низкий средний балл ({teacher['average_grade']:.2f})")
                    if teacher['attendance_rate'] < 70:
                        problems.append(f"низкая посещаемость ({teacher['attendance_rate']:.1f}%)")
                    advice_parts.append(f"- **{teacher['name']}** (кафедра: {teacher['department']}): {', '.join(problems)}")
            else:
                advice_parts.append("Проблемных преподавателей не найдено.")
        else:
            advice_parts.append(f"Вопрос: {context.get('query', '')}")
            advice_parts.append("\n**Общий анализ:**")
    else:
        advice_parts.append("**Общий анализ проблемных зон в системе:**\n")
    
    if not query or 'общ' in query:
        advice_parts.append(f"\n**Статистика:**")
        advice_parts.append(f"- Всего студентов: {context.get('total_students', 0)}")
        advice_parts.append(f"- Проблемных студентов: {context.get('problem_students_count', 0)}")
        advice_parts.append(f"- Проблемных групп: {context.get('problem_groups_count', 0)}")
        advice_parts.append(f"- Проблемных преподавателей: {context.get('problem_teachers_count', 0)}")
        
        if problem_students:
            advice_parts.append(f"\n**Топ проблемных студентов:**")
            for student in problem_students[:5]:
                problems = []
                if student['average_grade'] < 3.5:
                    problems.append(f"низкий средний балл ({student['average_grade']:.2f})")
                if student['attendance_rate'] < 70:
                    problems.append(f"низкая посещаемость ({student['attendance_rate']:.1f}%)")
                advice_parts.append(f"- {student['name']} (группа {student['group']}): {', '.join(problems)}")
        
        if problem_groups:
            advice_parts.append(f"\n**Топ проблемных групп:**")
            for group in problem_groups[:5]:
                problems = []
                if group['average_grade'] < 3.5:
                    problems.append(f"низкий средний балл ({group['average_grade']:.2f})")
                if group['attendance_rate'] < 70:
                    problems.append(f"низкая посещаемость ({group['attendance_rate']:.1f}%)")
                advice_parts.append(f"- Группа {group['group']}: {', '.join(problems)}")
    
    return "\n".join(advice_parts) if advice_parts else "Данные для анализа отсутствуют."


def get_admin_advice(db: Session, query: str = "") -> str:
    """Получение совета/ответа для админа"""
    context = prepare_admin_context(db, query)
    return generate_admin_advice_yandex(context)

