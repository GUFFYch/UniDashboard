from faker import Faker
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, date
import random
from app.models import (
    Student, Course, Teacher, Grade, Attendance, Schedule,
    LMSActivity, LibraryActivity, Event, Achievement, CourseTeacher, User,
    LoginLog, ActivityLog, AchievementTemplate, StudentAchievement, Group
)
from app.auth import get_password_hash

fake = Faker('ru_RU')
Faker.seed(42)
random.seed(42)


def generate_students(db: Session, count: int = 150):
    """Генерация студентов с разными категориями"""
    # Получаем или создаем группы
    groups = db.query(Group).all()
    if not groups:
        # Создаем группы, если их нет
        group_names = [f"ИТ-{i}" for i in range(1, 11)] + [f"ПИ-{i}" for i in range(1, 6)]
        departments = ["Информационные технологии"] * 10 + ["Программная инженерия"] * 5
        
        for name, dept in zip(group_names, departments):
            group = Group(name=name, department=dept)
            db.add(group)
            groups.append(group)
        db.commit()
    
    years = [1, 2, 3, 4]
    students = []
    
    # Определяем категории студентов
    excellent_count = int(count * 0.15)  # 15% отличников
    truant_count = int(count * 0.10)  # 10% прогульщиков
    non_attending_count = int(count * 0.05)  # 5% вообще не ходят
    regular_count = count - excellent_count - truant_count - non_attending_count
    
    student_categories = (
        ['excellent'] * excellent_count +
        ['truant'] * truant_count +
        ['non_attending'] * non_attending_count +
        ['regular'] * regular_count
    )
    random.shuffle(student_categories)
    
    for i in range(count):
        category = student_categories[i] if i < len(student_categories) else 'regular'
        selected_group = random.choice(groups)
        student = Student(
            name=fake.name(),
            email=fake.email(),
            group=selected_group.name,  # Для обратной совместимости
            group_id=selected_group.id,  # Явная связь с группой
            year=random.choice(years),
            is_headman=False  # По умолчанию не староста
        )
        # Сохраняем категорию в атрибуте для использования в других функциях
        student._category = category
        db.add(student)
        students.append(student)
    
    db.commit()
    
    # Назначаем старост для каждой группы (по одному на группу)
    students_by_group = {}
    for student in students:
        group_name = student.group
        if group_name not in students_by_group:
            students_by_group[group_name] = []
        students_by_group[group_name].append(student)
    
    # Для каждой группы выбираем случайного старосту (предпочтительно из обычных или отличников)
    for group_name, group_students in students_by_group.items():
        if group_students:
            # Предпочитаем обычных студентов или отличников для старост
            candidates = [s for s in group_students if hasattr(s, '_category') and s._category in ['regular', 'excellent']]
            if not candidates:
                candidates = group_students
            headman = random.choice(candidates)
            headman.is_headman = True
            
            # Обновляем группу с ID старосты
            group = next((g for g in groups if g.name == group_name), None)
            if group:
                group.headman_id = headman.id
                # Обновляем количество студентов в группе
                group.total_students = len(group_students)
    
    db.commit()
    return students


def generate_teachers(db: Session, count: int = 25):
    """Генерация преподавателей"""
    departments = [
        "Программная инженерия", "Информационные технологии", 
        "Прикладная математика и информатика", "Кибербезопасность",
        "Веб-технологии и мобильная разработка"
    ]
    
    teachers = []
    for i in range(count):
        teacher = Teacher(
            name=fake.name(),
            email=fake.email(),
            department=random.choice(departments)
        )
        db.add(teacher)
        teachers.append(teacher)
    
    db.commit()
    return teachers


def generate_courses(db: Session, count: int = 30):
    """Генерация курсов"""
    course_names = [
        "Программирование на Python", "Базы данных", "Веб-разработка",
        "Машинное обучение", "Алгоритмы и структуры данных", "Компьютерные сети",
        "Операционные системы", "Теория вероятностей и математическая статистика", 
        "Линейная алгебра и аналитическая геометрия",
        "Дискретная математика", "Архитектура вычислительных систем", "Кибербезопасность",
        "Мобильная разработка", "DevOps и CI/CD", "Облачные вычисления",
        "Объектно-ориентированное программирование", "Проектирование информационных систем",
        "Тестирование программного обеспечения", "Управление проектами в IT",
        "Введение в искусственный интеллект", "Большие данные и аналитика"
    ]
    
    courses = []
    for i, name in enumerate(course_names[:count]):
        # Генерируем коды курсов в формате ИТ-XXX или ПИ-XXX
        prefix = "ИТ" if i % 2 == 0 else "ПИ"
        course = Course(
            name=name,
            code=f"{prefix}-{2000 + i}",
            credits=random.choice([3, 4, 5, 6]),
            semester=random.choice([1, 2])
        )
        db.add(course)
        courses.append(course)
    
    db.commit()
    return courses


def generate_schedule(db: Session, courses, teachers):
    """Генерация расписания"""
    days = list(range(5))  # Понедельник-Пятница
    times = [
        ("09:00", "10:30"), ("10:40", "12:10"), ("12:20", "13:50"),
        ("14:30", "16:00"), ("16:10", "17:40")
    ]
    rooms = [f"{i}{j:02d}" for i in range(1, 5) for j in range(1, 21)]
    types = ["lecture", "seminar", "lab"]
    
    # Маппинг между department и префиксами курсов
    DEPARTMENT_COURSE_MAPPING = {
        "Программная инженерия": "ПИ",
        "Информационные технологии": "ИТ",
        "Прикладная математика и информатика": "ИТ",
        "Кибербезопасность": "ПИ",
        "Веб-технологии и мобильная разработка": "ИТ"
    }
    
    # Группируем курсы по префиксу кода
    courses_by_prefix = {}
    for course in courses:
        if course.code:
            prefix = course.code.split('-')[0]
            if prefix not in courses_by_prefix:
                courses_by_prefix[prefix] = []
            courses_by_prefix[prefix].append(course)
    
    # Сначала гарантируем, что каждый преподаватель получит хотя бы один курс
    # на основе его department
    teacher_course_map = {}
    available_courses = courses.copy()
    random.shuffle(available_courses)
    
    # Распределяем курсы так, чтобы каждый преподаватель получил хотя бы один курс
    # на основе его department
    for teacher in teachers:
        teacher_course_map[teacher.id] = []
        
        # Определяем префикс курса на основе department
        department = teacher.department
        course_prefix = None
        if department:
            for dept, prefix in DEPARTMENT_COURSE_MAPPING.items():
                if dept in department or department in dept:
                    course_prefix = prefix
                    break
        
        # Если нашли подходящий префикс, выбираем курс с этим префиксом
        if course_prefix and course_prefix in courses_by_prefix:
            available_courses_for_teacher = courses_by_prefix[course_prefix]
            if available_courses_for_teacher:
                # Выбираем курс, который еще не назначен другим преподавателям
                course = None
                min_assignments = float('inf')
                
                for c in available_courses_for_teacher:
                    teacher_count = db.query(CourseTeacher).filter(
                        CourseTeacher.course_id == c.id
                    ).count()
                    
                    if teacher_count < min_assignments:
                        min_assignments = teacher_count
                        course = c
                
                if course:
                    teacher_course_map[teacher.id].append(course)
        
        # Если не нашли подходящий курс по department, назначаем любой доступный
        if not teacher_course_map[teacher.id]:
            if available_courses:
                course = available_courses.pop(0) if available_courses else None
                if course:
                    teacher_course_map[teacher.id].append(course)
    
    # Остальные курсы распределяем случайно, учитывая department преподавателя
    remaining_courses = [c for c in courses if not any(c in courses_list for courses_list in teacher_course_map.values())]
    for course in remaining_courses:
        # Выбираем преподавателя с подходящим department
        course_prefix = course.code.split('-')[0] if course.code else None
        suitable_teachers = []
        
        for teacher in teachers:
            if course_prefix:
                department = teacher.department
                if department:
                    for dept, prefix in DEPARTMENT_COURSE_MAPPING.items():
                        if (dept in department or department in dept) and prefix == course_prefix:
                            suitable_teachers.append(teacher)
                            break
        
        # Если нашли подходящих преподавателей, выбираем из них
        if suitable_teachers:
            teacher = random.choice(suitable_teachers)
        else:
            # Иначе выбираем случайного преподавателя
            teacher = random.choice(teachers)
        
        teacher_course_map[teacher.id].append(course)
    
    # Создаем связи CourseTeacher и расписание
    for teacher_id, teacher_courses in teacher_course_map.items():
        for course in teacher_courses:
            # Проверяем, не создана ли уже связь
            existing = db.query(CourseTeacher).filter(
                CourseTeacher.course_id == course.id,
                CourseTeacher.teacher_id == teacher_id
            ).first()
            
            if not existing:
                ct = CourseTeacher(course_id=course.id, teacher_id=teacher_id)
                db.add(ct)
            
            # Создаем расписание
            for _ in range(random.randint(1, 3)):
                schedule = Schedule(
                    course_id=course.id,
                    teacher_id=teacher_id,
                    day_of_week=random.choice(days),
                    start_time=random.choice(times)[0],
                    end_time=random.choice(times)[1],
                    room=random.choice(rooms),
                    type=random.choice(types)
                )
                db.add(schedule)
    
    db.commit()


def generate_grades(db: Session, students, courses):
    """Генерация оценок с учетом категорий студентов и разных периодов года"""
    # Определяем периоды учебного года
    today = date.today()
    current_year_start = date(today.year, 9, 1)  # 1 сентября текущего года
    if today.month < 9:
        current_year_start = date(today.year - 1, 9, 1)  # Если сейчас до сентября, берем прошлый год
    
    # Убеждаемся, что начало учебного года не позже сегодня
    if current_year_start > today:
        current_year_start = date(today.year - 1, 9, 1)
    
    # Вычисляем количество дней от начала учебного года до сегодня
    days_since_start = (today - current_year_start).days
    
    # Если прошло меньше 30 дней, используем период от начала до сегодня
    if days_since_start < 30:
        valid_periods = [(current_year_start, today)]
    else:
        # Разбиваем период на несколько частей (по 60 дней)
        valid_periods = []
        period_start = current_year_start
        
        while period_start < today:
            period_end = min(period_start + timedelta(days=60), today)
            if period_end > period_start:
                valid_periods.append((period_start, period_end))
            period_start = period_end + timedelta(days=1)
        
        # Если не получилось создать периоды, используем один период
        if not valid_periods:
            valid_periods = [(current_year_start, today)]
    
    for student in students:
        # Определяем категорию студента
        category = getattr(student, '_category', 'regular')
        
        # Каждый студент изучает 5-8 курсов
        num_courses = min(random.randint(5, 8), len(courses))
        student_courses = random.sample(courses, num_courses)
        
        for course in student_courses:
            # Выбираем случайные периоды для оценок (2-4 периода из валидных)
            num_periods = min(random.randint(2, 4), len(valid_periods))
            selected_periods = random.sample(valid_periods, num_periods)
            
            for period_start, period_end in selected_periods:
                # Проверяем, что период валидный
                if period_end <= period_start:
                    continue
                # Экзамены (1-2 на период)
                num_exams = random.randint(1, 2)
                for _ in range(num_exams):
                    if category == 'excellent':
                        exam_grade = random.choices([4, 5], weights=[0.2, 0.8])[0]
                    elif category == 'truant' or category == 'non_attending':
                        exam_grade = random.choices([2, 3, 4], weights=[0.4, 0.4, 0.2])[0]
                    else:
                        exam_grade = random.choices([2, 3, 4, 5], weights=[0.05, 0.15, 0.35, 0.45])[0]
                    
                    grade = Grade(
                        student_id=student.id,
                        course_id=course.id,
                        value=exam_grade,
                        type="exam",
                        date=fake.date_between(start_date=period_start, end_date=period_end)
                    )
                    db.add(grade)
                
                # Тесты (2-4 на период)
                num_tests = random.randint(2, 4)
                for _ in range(num_tests):
                    if category == 'excellent':
                        test_grade = random.choices([4, 5], weights=[0.25, 0.75])[0]
                    elif category == 'truant' or category == 'non_attending':
                        test_grade = random.choices([2, 3, 4], weights=[0.5, 0.3, 0.2])[0]
                    else:
                        test_grade = random.choices([2, 3, 4, 5], weights=[0.1, 0.2, 0.35, 0.35])[0]
                    
                    grade = Grade(
                        student_id=student.id,
                        course_id=course.id,
                        value=test_grade,
                        type="test",
                        date=fake.date_between(start_date=period_start, end_date=period_end)
                    )
                    db.add(grade)
                
                # Курсовые работы (0-1 на период)
                if random.random() < 0.3:  # 30% вероятность курсовой
                    if category == 'excellent':
                        cw_grade = random.choices([4, 5], weights=[0.2, 0.8])[0]
                    elif category == 'truant' or category == 'non_attending':
                        cw_grade = random.choices([2, 3, 4], weights=[0.4, 0.4, 0.2])[0]
                    else:
                        cw_grade = random.choices([2, 3, 4, 5], weights=[0.1, 0.2, 0.4, 0.3])[0]
                    
                    grade = Grade(
                        student_id=student.id,
                        course_id=course.id,
                        value=cw_grade,
                        type="coursework",
                        date=fake.date_between(start_date=period_start, end_date=period_end)
                    )
                    db.add(grade)
                
                # Домашние задания (3-6 на период)
                num_homeworks = random.randint(3, 6)
                for _ in range(num_homeworks):
                    if category == 'excellent':
                        hw_grade = random.choices([4, 5], weights=[0.3, 0.7])[0]
                    elif category == 'truant' or category == 'non_attending':
                        hw_grade = random.choices([2, 3, 4], weights=[0.5, 0.3, 0.2])[0]
                    else:
                        hw_grade = random.choices([2, 3, 4, 5], weights=[0.05, 0.15, 0.4, 0.4])[0]
                    
                    grade = Grade(
                        student_id=student.id,
                        course_id=course.id,
                        value=hw_grade,
                        type="homework",
                        date=fake.date_between(start_date=period_start, end_date=period_end)
                    )
                    db.add(grade)
    
    db.commit()


def generate_attendance(db: Session, students, courses):
    """Генерация посещаемости с учетом категорий студентов и прогулов"""
    start_date = date.today() - timedelta(days=90)
    buildings = ["ПВ-78", "ПВ-86", "Ст", "МП", "СГ"]
    
    for student in students:
        category = getattr(student, '_category', 'regular')
        student_courses = random.sample(courses, random.randint(5, 8))
        
        # Определяем вероятность посещения в зависимости от категории
        if category == 'non_attending':
            # Вообще не ходят в институт
            base_attendance_prob = 0.0
            course_attendance_prob = 0.0
        elif category == 'truant':
            # Прогульщики - ходят редко
            base_attendance_prob = 0.3
            course_attendance_prob = 0.25
        elif category == 'excellent':
            # Отличники - ходят почти всегда
            base_attendance_prob = 0.95
            course_attendance_prob = 0.92
        else:
            # Обычные студенты
            base_attendance_prob = 0.75
            course_attendance_prob = 0.70
        
        # Генерируем общие посещения института (логи входа/выхода)
        current_date = start_date
        consecutive_absences = 0  # Счетчик подряд идущих прогулов
        
        while current_date <= date.today():
            # Посещения только в будние дни
            if current_date.weekday() < 5:
                # Для прогульщиков создаем периоды прогулов (3-7 дней подряд)
                if category == 'truant' and consecutive_absences == 0 and random.random() < 0.15:
                    # Начинаем период прогула
                    absence_days = random.randint(3, 7)
                    consecutive_absences = absence_days
                
                is_present = False
                if consecutive_absences > 0:
                    # Период прогула
                    consecutive_absences -= 1
                    is_present = False
                elif random.random() < base_attendance_prob:
                    is_present = True
                
                # Создаем запись посещаемости (присутствие или отсутствие)
                if is_present:
                    # Время входа: 8:00 - 10:00
                    entry_hour = random.randint(8, 10)
                    entry_minute = random.randint(0, 59)
                    entry_time = datetime.combine(current_date, datetime.min.time().replace(hour=entry_hour, minute=entry_minute))
                    
                    # Время выхода: 16:00 - 20:00
                    exit_hour = random.randint(16, 20)
                    exit_minute = random.randint(0, 59)
                    exit_time = datetime.combine(current_date, datetime.min.time().replace(hour=exit_hour, minute=exit_minute))
                    
                    building = random.choice(buildings)
                    
                    # Общее посещение (без привязки к курсу)
                    attendance = Attendance(
                        student_id=student.id,
                        course_id=None,
                        date=current_date,
                        present=True,
                        building=building,
                        entry_time=entry_time,
                        exit_time=exit_time
                    )
                    db.add(attendance)
                else:
                    # Запись об отсутствии
                    attendance = Attendance(
                        student_id=student.id,
                        course_id=None,
                        date=current_date,
                        present=False,
                        building=None,
                        entry_time=None,
                        exit_time=None
                    )
                    db.add(attendance)
            
            current_date += timedelta(days=1)
        
        # Генерируем посещаемость по курсам
        for course in student_courses:
            current_date = start_date
            consecutive_absences = 0
            
            while current_date <= date.today():
                # Занятия только в будние дни
                if current_date.weekday() < 5:
                    # Для прогульщиков создаем периоды прогулов на занятиях
                    if category == 'truant' and consecutive_absences == 0 and random.random() < 0.2:
                        absence_days = random.randint(2, 5)
                        consecutive_absences = absence_days
                    
                    is_present = False
                    if consecutive_absences > 0:
                        consecutive_absences -= 1
                        is_present = False
                    elif random.random() < course_attendance_prob:
                        is_present = True
                    
                    # Создаем запись посещаемости для курса
                    if is_present:
                        building = random.choice(buildings)
                        # Время входа для занятия
                        entry_hour = random.randint(8, 10)
                        entry_minute = random.randint(0, 59)
                        entry_time = datetime.combine(current_date, datetime.min.time().replace(hour=entry_hour, minute=entry_minute))
                        
                        attendance = Attendance(
                            student_id=student.id,
                            course_id=course.id,
                            date=current_date,
                            present=True,
                            building=building,
                            entry_time=entry_time,
                            exit_time=None  # Для занятий может не быть времени выхода
                        )
                        db.add(attendance)
                    else:
                        # Запись об отсутствии на занятии
                        attendance = Attendance(
                            student_id=student.id,
                            course_id=course.id,
                            date=current_date,
                            present=False,
                            building=None,
                            entry_time=None,
                            exit_time=None
                        )
                        db.add(attendance)
                
                current_date += timedelta(days=1)
    
    db.commit()


def generate_lms_activity(db: Session, students):
    """Генерация активности в LMS с учетом категорий студентов"""
    action_types = ["login", "view_material", "submit_assignment", "forum_post"]
    resources = [
        "lecture_1.pdf", "lecture_2.pdf", "lab_work_1", "lab_work_2",
        "homework_1", "homework_2", "course_materials", "forum_discussion"
    ]
    
    for student in students:
        category = getattr(student, '_category', 'regular')
        
        # Определяем количество действий в зависимости от категории
        if category == 'non_attending':
            num_actions = random.randint(0, 10)  # Почти не используют LMS
        elif category == 'truant':
            num_actions = random.randint(20, 60)  # Редко используют
        elif category == 'excellent':
            num_actions = random.randint(150, 300)  # Активно используют
        else:
            num_actions = random.randint(50, 200)  # Обычная активность
        
        # Генерируем активность за последние 30 дней
        for _ in range(num_actions):
            activity = LMSActivity(
                student_id=student.id,
                action_type=random.choice(action_types),
                resource=random.choice(resources),
                timestamp=fake.date_time_between(start_date='-30d', end_date='now')
            )
            db.add(activity)
    
    db.commit()


def generate_library_activity(db: Session, students):
    """Генерация активности в библиотеке"""
    resource_types = ["book", "article", "ebook"]
    book_names = [
        "Введение в алгоритмы", "Чистый код", "Архитектура компьютера",
        "Базы данных: проектирование", "Машинное обучение", "Веб-разработка"
    ]
    actions = ["borrow", "return", "view"]
    
    for student in students:
        for _ in range(random.randint(5, 30)):
            activity = LibraryActivity(
                student_id=student.id,
                resource_type=random.choice(resource_types),
                resource_name=random.choice(book_names),
                action=random.choice(actions),
                timestamp=fake.date_time_between(start_date='-90d', end_date='now')
            )
            db.add(activity)
    
    db.commit()


def generate_events(db: Session, count: int = 20):
    """Генерация мероприятий"""
    event_types = ["hackathon", "conference", "workshop", "competition"]
    event_names = [
        "Хакатон EduPulse по машинному обучению", 
        "Конференция по современным веб-технологиям",
        "Воркшоп по DevOps и облачным технологиям", 
        "Олимпиада по программированию EduPulse",
        "Митап разработчиков кафедры ИТ", 
        "Конкурс студенческих проектов",
        "Хакатон по кибербезопасности",
        "Конференция по большим данным",
        "Воркшоп по мобильной разработке",
        "Олимпиада по алгоритмам и структурам данных"
    ]
    
    for i in range(count):
        base_name = random.choice(event_names)
        event = Event(
            name=f"{base_name} {fake.year()}",
            type=random.choice(event_types),
            date=fake.date_between(start_date='-6m', end_date='+1m'),
            participants_count=random.randint(20, 200)
        )
        db.add(event)
    
    db.commit()


def generate_achievements(db: Session, students, courses):
    """Генерация достижений в новой нормализованной структуре"""
    achievement_templates_data = [
        {"name": "Отличник EduPulse", "description": "Средний балл выше 4.5", "points": 100, "icon": "⭐", "course_id": None},
        {"name": "Активный студент", "description": "Более 100 действий в LMS", "points": 50, "icon": "🔥", "course_id": None},
        {"name": "Посещаемость 100%", "description": "Идеальная посещаемость за семестр", "points": 75, "icon": "✅", "course_id": None},
        {"name": "Хакатонщик", "description": "Участие в 3+ хакатонах", "points": 150, "icon": "💻", "course_id": None},
        {"name": "Книжный червь", "description": "Более 20 книг из библиотеки", "points": 60, "icon": "📚", "course_id": None},
        {"name": "Мастер Python", "description": "Отлично сдан курс программирования", "points": 80, "icon": "🐍", "course_id": None},
        {"name": "База данных - профи", "description": "Превосходные знания баз данных", "points": 80, "icon": "🗄️", "course_id": None},
        {"name": "Веб-мастер", "description": "Отличные результаты по веб-разработке", "points": 80, "icon": "🌐", "course_id": None},
    ]
    
    # Создаем шаблоны достижений
    templates = []
    for ach_data in achievement_templates_data:
        # Пытаемся найти курс по названию, если указан
        course_id = ach_data["course_id"]
        if course_id is None and "Python" in ach_data["name"]:
            # Ищем курс Python
            python_course = next((c for c in courses if "Python" in c.name), None)
            course_id = python_course.id if python_course else None
        elif course_id is None and "баз данных" in ach_data["description"].lower():
            # Ищем курс баз данных
            db_course = next((c for c in courses if "баз данных" in c.name.lower() or "Базы данных" in c.name), None)
            course_id = db_course.id if db_course else None
        elif course_id is None and "веб" in ach_data["description"].lower():
            # Ищем курс веб-разработки
            web_course = next((c for c in courses if "веб" in c.name.lower() or "Веб" in c.name), None)
            course_id = web_course.id if web_course else None
        
        template = AchievementTemplate(
            name=ach_data["name"],
            description=ach_data["description"],
            icon=ach_data["icon"],
            points=ach_data["points"],
            course_id=course_id
        )
        db.add(template)
        templates.append(template)
    
    db.commit()
    
    # Выдаем достижения студентам
    for student in students:
        # Каждый студент получает 1-3 случайных достижения
        selected_templates = random.sample(templates, min(random.randint(1, 3), len(templates)))
        for template in selected_templates:
            student_achievement = StudentAchievement(
                student_id=student.id,
                achievement_template_id=template.id,
                unlocked_at=fake.date_time_between(start_date='-6m', end_date='now')
            )
            db.add(student_achievement)
    
    db.commit()


def generate_users(db: Session, students, teachers):
    """Генерация пользователей для аутентификации"""
    # Проверяем, есть ли уже тестовые аккаунты
    existing_student_user = db.query(User).filter(User.email == "student123").first()
    existing_teacher_user = db.query(User).filter(User.email == "teacher123").first()
    existing_admin_user = db.query(User).filter(User.email == "admin@edupulse.ru").first()
    
    # Создаем тестового студента, если его нет
    if not existing_student_user:
        # Находим первого студента или создаем тестового
        test_student = db.query(Student).filter(Student.email == "student123@edupulse.ru").first()
        if not test_student:
            # Берем первого студента
            test_student = db.query(Student).first()
        
        if test_student:
            user = User(
                email="student123",
                hashed_password=get_password_hash("student123"),
                role="student",
                student_id=test_student.id,
                is_active=True
            )
            db.add(user)
    
    # Создаем тестового преподавателя, если его нет
    if not existing_teacher_user:
        test_teacher = db.query(Teacher).filter(Teacher.email == "teacher123@edupulse.ru").first()
        if not test_teacher:
            # Берем первого преподавателя
            test_teacher = db.query(Teacher).first()
        
        if test_teacher:
            user = User(
                email="teacher123",
                hashed_password=get_password_hash("teacher123"),
                role="teacher",
                teacher_id=test_teacher.id,
                is_active=True
            )
            db.add(user)
    
    # Создаем администратора, если его нет
    if not existing_admin_user:
        admin_user = User(
            email="admin@edupulse.ru",
            hashed_password=get_password_hash("admin123"),
            role="admin",
            is_active=True
        )
        db.add(admin_user)
    
    # Создаем пользователей для остальных студентов (опционально)
    for student in students:
        # Пропускаем, если уже есть пользователь с таким email или student_id
        existing = db.query(User).filter(
            (User.email == student.email) | (User.student_id == student.id)
        ).first()
        if not existing:
            user = User(
                email=student.email,
                hashed_password=get_password_hash("student123"),
                role="student",
                student_id=student.id,
                is_active=True
            )
            db.add(user)
    
    # Создаем пользователей для остальных преподавателей
    for teacher in teachers:
        # Пропускаем, если уже есть пользователь с таким email или teacher_id
        existing = db.query(User).filter(
            (User.email == teacher.email) | (User.teacher_id == teacher.id)
        ).first()
        if not existing:
            user = User(
                email=teacher.email,
                hashed_password=get_password_hash("teacher123"),
                role="teacher",
                teacher_id=teacher.id,
                is_active=True
            )
            db.add(user)
    
    db.commit()


def generate_all_data(db: Session):
    """Генерация всех данных"""
    print("Генерация студентов...")
    students = generate_students(db, count=150)
    
    print("Генерация преподавателей...")
    teachers = generate_teachers(db, count=25)
    
    print("Генерация курсов...")
    courses = generate_courses(db, count=15)
    
    print("Генерация расписания...")
    generate_schedule(db, courses, teachers)
    
    print("Генерация оценок...")
    generate_grades(db, students, courses)
    
    print("Генерация посещаемости...")
    generate_attendance(db, students, courses)
    
    print("Генерация активности LMS...")
    generate_lms_activity(db, students)
    
    print("Генерация активности библиотеки...")
    generate_library_activity(db, students)
    
    print("Генерация мероприятий...")
    generate_events(db, count=20)
    
    print("Генерация достижений...")
    generate_achievements(db, students, courses)
    
    print("Генерация пользователей...")
    generate_users(db, students, teachers)
    
    print("Все данные сгенерированы!")

