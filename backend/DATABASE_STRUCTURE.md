# Структура базы данных EduPulse

## Обзор

База данных построена с явными связями между всеми сущностями. Все пользователи (студенты, преподаватели, админы) связаны через таблицу `users`.

## Основные таблицы

### 1. users (Пользователи)
Центральная таблица для всех пользователей системы.

**Поля:**
- `id` - первичный ключ
- `email` - уникальный email (используется для входа)
- `hashed_password` - хеш пароля
- `role` - роль: `student`, `teacher`, `admin`
- `student_id` - внешний ключ на `students.id` (если роль = student)
- `teacher_id` - внешний ключ на `teachers.id` (если роль = teacher)
- `is_active` - активен ли пользователь
- `created_at` - дата создания

**Связи:**
- `student_id` → `students.id` (один к одному)
- `teacher_id` → `teachers.id` (один к одному)

### 2. students (Студенты)
Таблица студентов с привязкой к группам.

**Поля:**
- `id` - первичный ключ
- `name` - ФИО студента
- `email` - email студента
- `group` - название группы (для обратной совместимости)
- `group_id` - внешний ключ на `groups.id` (явная связь)
- `year` - курс (1-4)
- `is_headman` - флаг старосты группы
- `created_at` - дата создания

**Связи:**
- `group_id` → `groups.id` (многие к одному)
- Обратная связь: `users.student_id` → `students.id` (один к одному)

### 3. teachers (Преподаватели)
Таблица преподавателей.

**Поля:**
- `id` - первичный ключ
- `name` - ФИО преподавателя
- `email` - email преподавателя
- `department` - кафедра
- `created_at` - дата создания

**Связи:**
- Обратная связь: `users.teacher_id` → `teachers.id` (один к одному)
- `course_teachers.teacher_id` → `teachers.id` (многие ко многим через промежуточную таблицу)

### 4. groups (Группы)
Таблица групп студентов.

**Поля:**
- `id` - первичный ключ
- `name` - название группы (уникальное, например "ИТ-1")
- `department` - кафедра
- `total_students` - количество студентов (вычисляемое)
- `headman_id` - внешний ключ на `students.id` (староста группы)
- `average_gpa` - средний балл группы (вычисляемое)
- `average_attendance_rate` - средняя посещаемость (вычисляемое)
- `updated_at` - время последнего обновления

**Связи:**
- `headman_id` → `students.id` (один к одному)
- Обратная связь: `students.group_id` → `groups.id` (многие к одному)

### 5. courses (Курсы)
Таблица курсов.

**Поля:**
- `id` - первичный ключ
- `name` - название курса
- `code` - код курса (уникальный)
- `credits` - количество кредитов
- `semester` - семестр (1 или 2)
- `created_at` - дата создания

**Связи:**
- `course_teachers.course_id` → `courses.id` (многие ко многим через промежуточную таблицу)
- `grades.course_id` → `courses.id` (один ко многим)
- `attendance.course_id` → `courses.id` (один ко многим)
- `schedule.course_id` → `courses.id` (один ко многим)

### 6. course_teachers (Связь курсов и преподавателей)
Промежуточная таблица для связи многие-ко-многим между курсами и преподавателями.

**Поля:**
- `id` - первичный ключ
- `course_id` - внешний ключ на `courses.id`
- `teacher_id` - внешний ключ на `teachers.id`

**Связи:**
- `course_id` → `courses.id` (многие к одному)
- `teacher_id` → `teachers.id` (многие к одному)

### 7. grades (Оценки)
Таблица оценок студентов.

**Поля:**
- `id` - первичный ключ
- `student_id` - внешний ключ на `students.id`
- `course_id` - внешний ключ на `courses.id`
- `value` - значение оценки (2-5)
- `type` - тип оценки: `exam`, `test`, `coursework`, `homework`
- `date` - дата получения оценки
- `created_at` - дата создания записи

**Связи:**
- `student_id` → `students.id` (многие к одному)
- `course_id` → `courses.id` (многие к одному)

### 8. attendance (Посещаемость)
Таблица посещаемости студентов.

**Поля:**
- `id` - первичный ключ
- `student_id` - внешний ключ на `students.id`
- `course_id` - внешний ключ на `courses.id` (может быть NULL для общих посещений)
- `date` - дата
- `present` - присутствовал ли студент (boolean)
- `building` - здание (ПВ-78, ПВ-86, Ст, МП, СГ)
- `entry_time` - время входа в здание
- `exit_time` - время выхода из здания
- `created_at` - дата создания записи

**Связи:**
- `student_id` → `students.id` (многие к одному)
- `course_id` → `courses.id` (многие к одному, может быть NULL)

### 9. schedule (Расписание)
Таблица расписания занятий.

**Поля:**
- `id` - первичный ключ
- `course_id` - внешний ключ на `courses.id`
- `teacher_id` - внешний ключ на `teachers.id`
- `day_of_week` - день недели (0-6, где 0 = понедельник)
- `start_time` - время начала (строка, например "09:00")
- `end_time` - время окончания (строка, например "10:30")
- `room` - аудитория
- `type` - тип занятия: `lecture`, `seminar`, `lab`

**Связи:**
- `course_id` → `courses.id` (многие к одному)
- `teacher_id` → `teachers.id` (многие к одному)

### 10. achievement_templates (Шаблоны достижений)
Таблица шаблонов достижений.

**Поля:**
- `id` - первичный ключ
- `name` - название достижения
- `description` - описание
- `icon` - иконка (эмодзи или код)
- `points` - количество баллов
- `course_id` - внешний ключ на `courses.id` (может быть NULL для общих достижений)
- `deleted` - флаг удаления (soft delete)
- `created_at` - дата создания

**Связи:**
- `course_id` → `courses.id` (многие к одному, может быть NULL)
- Обратная связь: `student_achievements.achievement_template_id` → `achievement_templates.id`

### 11. student_achievements (Выданные достижения)
Таблица выданных студентам достижений.

**Поля:**
- `id` - первичный ключ
- `student_id` - внешний ключ на `students.id`
- `achievement_template_id` - внешний ключ на `achievement_templates.id`
- `unlocked_at` - дата получения достижения

**Связи:**
- `student_id` → `students.id` (многие к одному)
- `achievement_template_id` → `achievement_templates.id` (многие к одному)

### 12. student_predictions (Предсказания для студентов)
Таблица предсказаний AI для студентов.

**Поля:**
- `id` - первичный ключ
- `student_id` - внешний ключ на `students.id`
- `burnout_risk` - риск выгорания (0-1)
- `success_probability` - вероятность успеха (0-1)
- `predicted_gpa` - предсказанный средний балл
- `calculated_at` - дата расчета

**Связи:**
- `student_id` → `students.id` (многие к одному)

### 13. lms_activity (Активность в LMS)
Таблица активности студентов в системе управления обучением.

**Поля:**
- `id` - первичный ключ
- `student_id` - внешний ключ на `students.id`
- `action_type` - тип действия: `login`, `view_material`, `submit_assignment`, `forum_post`
- `resource` - ресурс (название файла, задания и т.д.)
- `timestamp` - время действия

**Связи:**
- `student_id` → `students.id` (многие к одному)

### 14. library_activity (Активность в библиотеке)
Таблица активности студентов в библиотеке.

**Поля:**
- `id` - первичный ключ
- `student_id` - внешний ключ на `students.id`
- `resource_type` - тип ресурса: `book`, `article`, `ebook`
- `resource_name` - название ресурса
- `action` - действие: `borrow`, `return`, `view`
- `timestamp` - время действия

**Связи:**
- `student_id` → `students.id` (многие к одному)

### 15. events (Мероприятия)
Таблица мероприятий (хакатоны, конференции и т.д.).

**Поля:**
- `id` - первичный ключ
- `name` - название мероприятия
- `type` - тип: `hackathon`, `conference`, `workshop`, `competition`
- `date` - дата мероприятия
- `participants_count` - количество участников
- `created_at` - дата создания записи

### 16. login_logs (Логи входа)
Таблица логов входа пользователей.

**Поля:**
- `id` - первичный ключ
- `user_id` - внешний ключ на `users.id`
- `login_time` - время входа
- `logout_time` - время выхода (может быть NULL)
- `ip_address` - IP адрес
- `user_agent` - User-Agent браузера

**Связи:**
- `user_id` → `users.id` (многие к одному)

### 17. activity_logs (Логи активности)
Таблица логов всех действий в системе.

**Поля:**
- `id` - первичный ключ
- `user_id` - внешний ключ на `users.id` (может быть NULL для системных действий)
- `action_type` - тип действия: `create`, `update`, `delete`
- `table_name` - название таблицы
- `record_id` - ID записи
- `old_values` - старые значения (JSON)
- `new_values` - новые значения (JSON)
- `timestamp` - время действия

**Связи:**
- `user_id` → `users.id` (многие к одному, может быть NULL)

## Тестовые аккаунты

После перестройки БД создаются следующие тестовые аккаунты:

- **Студент:** `student123` / `student123`
- **Преподаватель:** `teacher123` / `teacher123`
- **Админ:** `admin@edupulse.ru` / `admin123`

## Перестройка базы данных

Для полной перестройки БД с нуля выполните:

```bash
cd backend
python rebuild_db_clean.py
```

Скрипт:
1. Удалит все существующие таблицы
2. Создаст все таблицы заново
3. Создаст тестовые аккаунты
4. Сгенерирует разнообразные тестовые данные:
   - 150 студентов (15% отличников, 10% прогульщиков, 5% не посещающих)
   - 25 преподавателей
   - 15 курсов
   - Оценки с разными типами и периодами
   - Посещаемость с разными паттернами
   - Достижения
   - Активность в LMS и библиотеке

## Диаграмма связей

```
users (1) ──→ (1) students ──→ (N) groups
  │                              ↑
  │                              │
  └──→ (1) teachers              │
         │                        │
         └──→ (N) course_teachers ──→ (N) courses
                                              │
                                              ├──→ (N) grades
                                              ├──→ (N) attendance
                                              └──→ (N) schedule

students ──→ (N) student_achievements ──→ (N) achievement_templates
students ──→ (N) student_predictions
students ──→ (N) lms_activity
students ──→ (N) library_activity

users ──→ (N) login_logs
users ──→ (N) activity_logs
```

