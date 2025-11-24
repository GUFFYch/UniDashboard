import numpy as np
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import Student, Grade, Attendance, StudentPrediction
from datetime import date, timedelta


def calculate_burnout_risk(db: Session, student_id: int) -> float:
    """Расчет риска выгорания студента"""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        return 0.0
    
    # Факторы риска выгорания
    risk_factors = []
    
    # 1. Количество дедлайнов (оценок за последние 30 дней)
    recent_grades_count = db.query(Grade).filter(
        Grade.student_id == student_id,
        Grade.date >= date.today() - timedelta(days=30)
    ).count()
    if recent_grades_count > 15:
        risk_factors.append(0.3)
    elif recent_grades_count > 10:
        risk_factors.append(0.2)
    
    # 2. Низкая посещаемость
    # Используем with_entities для совместимости со старой схемой БД
    total_attendance = db.query(Attendance.id).filter(
        Attendance.student_id == student_id,
        Attendance.date >= date.today() - timedelta(days=30)
    ).count()
    present_attendance = db.query(Attendance.id).filter(
        Attendance.student_id == student_id,
        Attendance.date >= date.today() - timedelta(days=30),
        Attendance.present == True
    ).count()
    
    if total_attendance > 0:
        attendance_rate = present_attendance / total_attendance
        if attendance_rate < 0.7:
            risk_factors.append(0.25)
        elif attendance_rate < 0.8:
            risk_factors.append(0.15)
    
    # 3. Низкая активность в LMS - убрано из расчета
    
    # 4. Снижение успеваемости
    recent_grades = db.query(Grade.value).filter(
        Grade.student_id == student_id,
        Grade.date >= date.today() - timedelta(days=30)
    ).all()
    old_grades = db.query(Grade.value).filter(
        Grade.student_id == student_id,
        Grade.date < date.today() - timedelta(days=30),
        Grade.date >= date.today() - timedelta(days=60)
    ).all()
    
    if len(recent_grades) > 0 and len(old_grades) > 0:
        recent_avg = np.mean([g[0] for g in recent_grades])
        old_avg = np.mean([g[0] for g in old_grades])
        if recent_avg < old_avg - 0.5:
            risk_factors.append(0.25)
    
    # Общий риск выгорания (0-1)
    burnout_risk = min(sum(risk_factors), 1.0)
    return round(burnout_risk, 2)


def calculate_success_probability(db: Session, student_id: int) -> float:
    """
    Расчет вероятности успешного завершения семестра
    
    Формула учитывает:
    1. Средний балл (до 40% вклада)
    2. Посещаемость (до 30% вклада)
    3. Стабильность оценок (до 10% вклада)
    
    Итого: максимум 80% (0.8), но ограничено до 40% при 0% посещаемости
    """
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        return 0.5
    
    success_factors = []
    
    # 1. Средний балл (вес: до 40%)
    avg_grade = db.query(func.avg(Grade.value)).filter(
        Grade.student_id == student_id
    ).scalar()
    
    if avg_grade:
        if avg_grade >= 4.5:
            success_factors.append(0.4)
        elif avg_grade >= 4.0:
            success_factors.append(0.3)
        elif avg_grade >= 3.5:
            success_factors.append(0.2)
        else:
            success_factors.append(0.1)
    
    # 2. Посещаемость (вес: до 30%)
    # Используем with_entities для совместимости со старой схемой БД
    total_attendance = db.query(Attendance.id).filter(
        Attendance.student_id == student_id,
        Attendance.date >= date.today() - timedelta(days=60)
    ).count()
    present_attendance = db.query(Attendance.id).filter(
        Attendance.student_id == student_id,
        Attendance.date >= date.today() - timedelta(days=60),
        Attendance.present == True
    ).count()
    
    attendance_penalty = False  # Флаг для применения штрафа за отсутствие посещаемости
    
    if total_attendance > 0:
        # Есть записи о посещаемости - учитываем процент посещаемости
        attendance_rate = present_attendance / total_attendance
        success_factors.append(attendance_rate * 0.3)
        
        # Если посещаемость 0%, применяем штраф
        if attendance_rate == 0.0:
            attendance_penalty = True
    else:
        # Нет записей о посещаемости
        # Проверяем, есть ли у студента оценки (может быть новый студент)
        has_grades = db.query(Grade).filter(Grade.student_id == student_id).count() > 0
        if has_grades:
            # У студента есть оценки, но нет записей о посещаемости - это плохо
            # Штрафуем как за 0% посещаемости (0 баллов из 30%)
            success_factors.append(0.0)
            attendance_penalty = True
        else:
            # У студента нет ни оценок, ни посещаемости - возможно новый студент
            # Не штрафуем, но и не добавляем бонус
            success_factors.append(0.0)
    
    # 3. Стабильность оценок (вес: до 10%)
    # Чем меньше разброс оценок, тем выше стабильность
    recent_grades = db.query(Grade.value).filter(
        Grade.student_id == student_id,
        Grade.date >= date.today() - timedelta(days=60)
    ).all()
    if len(recent_grades) > 5:
        grades_std = np.std([g[0] for g in recent_grades])
        # Стандартное отклонение: чем меньше, тем лучше
        # Нормализуем: std=0 -> score=1.0, std>=1 -> score=0
        stability_score = max(0, 1 - grades_std) * 0.1
        success_factors.append(stability_score)
    
    success_probability = min(sum(success_factors), 1.0)
    
    # Применяем штраф за отсутствие посещаемости
    # Если посещаемость 0%, максимальная вероятность успеха ограничена 40%
    if attendance_penalty:
        success_probability = min(success_probability, 0.4)
    
    return round(success_probability, 2)


def predict_gpa(db: Session, student_id: int) -> float:
    """Предсказание итогового GPA"""
    current_avg = db.query(func.avg(Grade.value)).filter(
        Grade.student_id == student_id
    ).scalar()
    
    if not current_avg:
        return 3.5
    
    # Простая модель: текущий средний балл с небольшими корректировками
    # на основе трендов
    recent_grades = db.query(Grade.value).filter(
        Grade.student_id == student_id,
        Grade.date >= date.today() - timedelta(days=30)
    ).all()
    
    if len(recent_grades) > 0:
        recent_avg = np.mean([g[0] for g in recent_grades])
        # Если недавние оценки выше среднего, прогноз оптимистичный
        if recent_avg > current_avg:
            predicted = min(current_avg + 0.2, 5.0)
        else:
            predicted = max(current_avg - 0.1, 2.0)
    else:
        predicted = current_avg
    
    return round(predicted, 2)


def update_student_predictions(db: Session, student_id: int):
    """Обновление всех предсказаний для студента"""
    burnout_risk = calculate_burnout_risk(db, student_id)
    success_prob = calculate_success_probability(db, student_id)
    predicted_gpa = predict_gpa(db, student_id)
    
    # Удаляем старые предсказания
    db.query(StudentPrediction).filter(
        StudentPrediction.student_id == student_id
    ).delete()
    
    # Создаем новое предсказание
    prediction = StudentPrediction(
        student_id=student_id,
        burnout_risk=burnout_risk,
        success_probability=success_prob,
        predicted_gpa=predicted_gpa
    )
    db.add(prediction)
    db.commit()
    
    return prediction

