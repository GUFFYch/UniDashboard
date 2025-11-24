"""
Скрипт миграции данных из старой таблицы achievements в новую нормализованную структуру

Запуск:
    cd backend
    python -m app.migrate_achievements
"""
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.database import engine
from app.models import Achievement, AchievementTemplate, StudentAchievement, Base
import sys

def migrate_achievements():
    """Миграция данных из achievements в achievement_templates и student_achievements"""
    
    # Создаем таблицы если их нет
    Base.metadata.create_all(bind=engine)
    
    Session = sessionmaker(bind=engine)
    db = Session()
    
    try:
        print("Начало миграции achievements...")
        
        # Проверяем, есть ли уже данные в новых таблицах
        existing_templates = db.query(AchievementTemplate).count()
        if existing_templates > 0:
            print(f"В таблице achievement_templates уже есть {existing_templates} записей.")
            response = input("Продолжить миграцию? (y/n): ")
            if response.lower() != 'y':
                print("Миграция отменена.")
                return
        
        # Шаг 1: Создаем уникальные шаблоны из старой таблицы
        print("Шаг 1: Создание шаблонов достижений...")
        
        # Получаем уникальные шаблоны (где student_id IS NULL или берем первый для каждого уникального name+course_id)
        templates_query = text("""
            SELECT DISTINCT 
                name, 
                description, 
                icon, 
                points, 
                course_id,
                deleted
            FROM achievements
            WHERE student_id IS NULL
            GROUP BY name, course_id
        """)
        
        result = db.execute(templates_query)
        templates_data = result.fetchall()
        
        template_map = {}  # (name, course_id) -> template_id
        
        for row in templates_data:
            name, description, icon, points, course_id, deleted = row
            
            # Проверяем, существует ли уже такой шаблон
            existing = db.query(AchievementTemplate).filter(
                AchievementTemplate.name == name,
                AchievementTemplate.course_id == (course_id if course_id else None)
            ).first()
            
            if existing:
                template_map[(name, course_id)] = existing.id
                print(f"  ✓ Шаблон уже существует: {name} (ID: {existing.id})")
            else:
                template = AchievementTemplate(
                    name=name,
                    description=description,
                    icon=icon,
                    points=points or 0,
                    course_id=course_id,
                    deleted=bool(deleted) if deleted is not None else False
                )
                db.add(template)
                db.flush()  # Получаем ID без коммита
                template_map[(name, course_id)] = template.id
                print(f"  ✓ Создан шаблон: {name} (ID: {template.id})")
        
        db.commit()
        print(f"  ✓ Создано {len(template_map)} шаблонов")
        
        # Шаг 2: Мигрируем выданные ачивки студентам
        print("\nШаг 2: Миграция выданных достижений студентам...")
        
        # Получаем все выданные ачивки (где student_id IS NOT NULL)
        student_achievements_query = text("""
            SELECT 
                id,
                student_id,
                name,
                course_id,
                unlocked_at
            FROM achievements
            WHERE student_id IS NOT NULL
        """)
        
        result = db.execute(student_achievements_query)
        student_achievements_data = result.fetchall()
        
        migrated_count = 0
        skipped_count = 0
        
        for row in student_achievements_data:
            old_id, student_id, name, course_id, unlocked_at = row
            
            # Находим соответствующий шаблон
            template_key = (name, course_id)
            template_id = template_map.get(template_key)
            
            if not template_id:
                # Если шаблона нет, создаем его
                print(f"  Шаблон не найден для {name}, создаем...")
                template = AchievementTemplate(
                    name=name,
                    course_id=course_id,
                    points=0
                )
                db.add(template)
                db.flush()
                template_id = template.id
                template_map[template_key] = template_id
            
            # Проверяем, нет ли уже такой связи
            existing_link = db.query(StudentAchievement).filter(
                StudentAchievement.student_id == student_id,
                StudentAchievement.achievement_template_id == template_id
            ).first()
            
            if existing_link:
                skipped_count += 1
                continue
            
            # Создаем связь
            student_achievement = StudentAchievement(
                student_id=student_id,
                achievement_template_id=template_id,
                unlocked_at=unlocked_at
            )
            db.add(student_achievement)
            migrated_count += 1
            
            if migrated_count % 100 == 0:
                db.commit()
                print(f"  ✓ Мигрировано {migrated_count} записей...")
        
        db.commit()
        print(f"\n✓ Миграция завершена!")
        print(f"  - Мигрировано: {migrated_count} записей")
        print(f"  - Пропущено (дубликаты): {skipped_count} записей")
        print(f"  - Всего шаблонов: {len(template_map)}")
        
        # Статистика
        total_templates = db.query(AchievementTemplate).count()
        total_links = db.query(StudentAchievement).count()
        print(f"\nИтоговая статистика:")
        print(f"  - Шаблонов достижений: {total_templates}")
        print(f"  - Выданных достижений: {total_links}")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Ошибка при миграции: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    migrate_achievements()

