import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api, Student } from '../services/api';
import { formatGrade } from '../utils/rounding';
import { decodeGroupHash } from '../utils/groupHash';

interface CourseTeacher {
  teacher_id: number;
  teacher_name: string;
  teacher_email: string;
  average_grade: number;
  attendance_rate: number;
}

interface CourseInfo {
  course_id: number;
  course_name: string;
  course_code?: string;
  teachers: CourseTeacher[];
}

const GroupStatsPage: React.FC = () => {
  const { groupName } = useParams<{ groupName: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [courses, setCourses] = useState<CourseInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState<number | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  useEffect(() => {
    if (groupName) {
      // Декодируем hash группы обратно в название
      const decodedGroupName = decodeGroupHash(groupName);
      
      // Проверяем права доступа для студентов
      if (user?.role === 'student') {
        // Студент может видеть только статистику своей группы, если он староста
        if (!user.student_id) {
          navigate('/');
          return;
        }
        // Проверка будет выполнена на бэкенде, но можно добавить предварительную проверку
      }
      
      loadGroupStats(decodedGroupName);
    }
  }, [groupName, user, navigate]);

  const loadGroupStats = async (group: string) => {
    try {
      setLoading(true);
      
      const statsData = await api.getGroupStats(group);
      setStats(statsData);
      
      // Преобразуем студентов из ответа API и сортируем так, чтобы староста был первым
      const groupStudents = statsData.students.map((s: any) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        is_headman: s.is_headman || false,
        hash_id: s.hash_id,
        group: group,
        present_today: s.present_today || false,
      }));
      // Сортируем: староста первым, остальные по имени
      const sortedStudents = [...groupStudents].sort((a, b) => {
        if (a.is_headman && !b.is_headman) return -1;
        if (!a.is_headman && b.is_headman) return 1;
        return a.name.localeCompare(b.name);
      });
      setStudents(sortedStudents);
      
      // Устанавливаем курсы
      setCourses(statsData.courses || []);
      
      // Выбираем первый курс и первого преподавателя по умолчанию
      if (statsData.courses && statsData.courses.length > 0) {
        setSelectedCourseId(statsData.courses[0].course_id);
        if (statsData.courses[0].teachers.length > 0) {
          setSelectedTeacherId(statsData.courses[0].teachers[0].teacher_id);
        }
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading group stats:', error);
      setLoading(false);
    }
  };

  const handleSetHeadman = async (studentId: number, isHeadman: boolean, closeModal?: () => void) => {
    if (!window.confirm(
      isHeadman 
        ? 'Назначить этого студента старостой группы? Текущий староста будет автоматически снят.'
        : 'Снять этого студента с должности старосты?'
    )) {
      return;
    }

    try {
      const result = await api.setHeadman(studentId, isHeadman);
      alert(result.message);
      // Перезагружаем данные группы
      if (groupName) {
        await loadGroupStats(decodeGroupHash(groupName));
      }
      // Закрываем модальное окно, если оно открыто
      if (closeModal) {
        closeModal();
      }
    } catch (error: any) {
      console.error('Error setting headman:', error);
      alert(error.response?.data?.detail || 'Ошибка при назначении старосты');
    }
  };

  const handleGoToCourse = (courseId: number, teacherId: number) => {
    // Переходим к курсу с фильтром по группе
    navigate(`/course/${courseId}?group=${encodeURIComponent(stats.group)}&teacher=${teacherId}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white text-xl">Загрузка...</div>
      </div>
    );
  }

  if (!stats || students.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-white text-xl">Группа не найдена</div>
        <Link to="/admin" className="text-white/80 hover:text-white mt-4 inline-block">
          ← Назад
        </Link>
      </div>
    );
  }

  const selectedCourse = courses.find(c => c.course_id === selectedCourseId);
  const selectedTeacher = selectedCourse?.teachers.find(t => t.teacher_id === selectedTeacherId);

  // Определяем, куда ведет ссылка "Назад" в зависимости от роли
  const getBackLink = () => {
    if (user?.role === 'student') {
      return '/';
    } else if (user?.role === 'admin') {
      return '/admin';
    } else if (user?.role === 'teacher') {
      return '/teacher';
    }
    return '/';
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Link to={getBackLink()} className="text-white/80 hover:text-white mb-4 inline-block">
        ← Назад
      </Link>

      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Статистика группы {stats.group}</h1>
            <p className="text-white/80">Всего студентов: {stats.total_students}</p>
          </div>
          {user?.role === 'admin' && (
            <button
              onClick={() => setShowSettingsModal(true)}
              className="px-6 py-3 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 rounded-lg text-blue-300 transition-colors flex items-center gap-2"
            >
              <span>⚙️</span>
              Настройки группы
            </button>
          )}
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h3 className="text-lg font-bold text-white mb-2">Средний GPA</h3>
          <div className="text-4xl font-bold text-yellow-400">
            {formatGrade(stats.average_gpa)}
          </div>
        </div>
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h3 className="text-lg font-bold text-white mb-2">Студентов</h3>
          <div className="text-4xl font-bold text-blue-400">
            {stats.total_students}
          </div>
        </div>
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h3 className="text-lg font-bold text-white mb-2">Посещаемость</h3>
          <div className="text-4xl font-bold text-green-400">
            {stats.attendance_rate.toFixed(1)}%
          </div>
        </div>
      </div>


      {/* Курсы группы */}
      {courses.length > 0 && (
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 mb-8">
          <h2 className="text-xl font-bold text-white mb-4">Курсы группы</h2>
          
          {/* Выбор курса */}
          <div className="mb-6">
            <label className="block text-white mb-2">Выберите курс:</label>
            <div className="flex flex-wrap gap-2">
              {courses.map((course) => (
                <button
                  key={course.course_id}
                  onClick={() => {
                    setSelectedCourseId(course.course_id);
                    if (course.teachers.length > 0) {
                      setSelectedTeacherId(course.teachers[0].teacher_id);
                    }
                  }}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    selectedCourseId === course.course_id
                      ? 'bg-blue-500 text-white'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  {course.course_name} {course.course_code && `(${course.course_code})`}
                </button>
              ))}
            </div>
          </div>

          {/* Вкладки преподавателей для выбранного курса */}
          {selectedCourse && selectedCourse.teachers.length > 0 && (
            <div>
              <label className="block text-white mb-2">Преподаватели курса:</label>
              <div className="flex flex-wrap gap-2 mb-4">
                {selectedCourse.teachers.map((teacher) => (
                  <button
                    key={teacher.teacher_id}
                    onClick={() => setSelectedTeacherId(teacher.teacher_id)}
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      selectedTeacherId === teacher.teacher_id
                        ? 'bg-purple-500 text-white'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {teacher.teacher_name}
                  </button>
                ))}
              </div>

              {/* Статистика выбранного преподавателя */}
              {selectedTeacher && (
                <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-white mb-1">
                        {selectedCourse.course_name}
                      </h3>
                      <p className="text-white/60 text-sm mb-2">
                        Преподаватель: {selectedTeacher.teacher_name}
                      </p>
                      <p className="text-white/60 text-sm">
                        Email: {selectedTeacher.teacher_email}
                      </p>
                    </div>
                    <button
                      onClick={() => handleGoToCourse(selectedCourse.course_id, selectedTeacher.teacher_id)}
                      className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors"
                    >
                      Перейти к курсу →
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white/5 rounded-lg p-4">
                      <h4 className="text-white/60 text-sm mb-1">Средняя успеваемость</h4>
                      <div className="text-2xl font-bold text-yellow-400">
                        {formatGrade(selectedTeacher.average_grade)}
                      </div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-4">
                      <h4 className="text-white/60 text-sm mb-1">Посещаемость</h4>
                      <div className="text-2xl font-bold text-green-400">
                        {selectedTeacher.attendance_rate.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Список студентов */}
      <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
        <h2 className="text-xl font-bold text-white mb-4">Студенты группы</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {students.map((student) => (
            <div
              key={student.id}
              className={`rounded-lg p-4 border transition-colors ${
                student.is_headman
                  ? 'bg-yellow-500/20 border-yellow-500/50 hover:bg-yellow-500/30'
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <Link to={`/student/${student.hash_id}`} className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`font-medium ${student.is_headman ? 'text-yellow-300' : 'text-white'}`}>
                      {student.name}
                    </div>
                    {student.is_headman && (
                      <span className="bg-yellow-500/30 text-yellow-200 text-xs px-2 py-1 rounded font-semibold">
                        Староста
                      </span>
                    )}
                  </div>
                  <div className={`text-sm ${student.is_headman ? 'text-yellow-200/80' : 'text-white/60'}`}>
                    {student.email}
                  </div>
                </Link>
                {/* Индикатор посещаемости сегодня */}
                <div className="flex-shrink-0 ml-2">
                  {(student as any).present_today ? (
                    <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center" title="Был сегодня в университете">
                      <span className="text-white text-xs font-bold">✓</span>
                    </div>
                  ) : (
                    <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center" title="Не был сегодня в университете">
                      <span className="text-white text-xs font-bold">Н</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Модальное окно настроек */}
      {showSettingsModal && (
        <GroupSettingsModal
          students={students}
          onSetHeadman={(studentId, isHeadman) => handleSetHeadman(studentId, isHeadman, () => setShowSettingsModal(false))}
          onClose={() => setShowSettingsModal(false)}
        />
      )}
    </div>
  );
};

// Компонент модального окна настроек группы
const GroupSettingsModal: React.FC<{
  students: Student[];
  onSetHeadman: (studentId: number, isHeadman: boolean) => void;
  onClose: () => void;
}> = ({ students, onSetHeadman, onClose }) => {
  const currentHeadman = students.find(s => s.is_headman);

  const handleSetHeadman = async (studentId: number, isHeadman: boolean) => {
    if (!window.confirm(
      isHeadman 
        ? 'Назначить этого студента старостой группы? Текущий староста будет автоматически снят.'
        : 'Снять этого студента с должности старосты?'
    )) {
      return;
    }

    await onSetHeadman(studentId, isHeadman);
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div 
        className="bg-gray-900 rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto border border-white/20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Настройки группы</h2>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-4">Управление старостой</h3>
          
          {currentHeadman ? (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white font-medium mb-1">
                    Текущий староста: {currentHeadman.name}
                  </div>
                  <div className="text-white/60 text-sm">
                    {currentHeadman.email}
                  </div>
                </div>
                <button
                  onClick={() => handleSetHeadman(currentHeadman.id, false)}
                  className="bg-red-500/20 hover:bg-red-500/30 text-red-300 px-4 py-2 rounded-lg transition-colors text-sm"
                >
                  Снять с должности
                </button>
              </div>
            </div>
          ) : (
            <p className="text-white/60 mb-4">Староста не назначен</p>
          )}

          <div className="space-y-2">
            <p className="text-white/80 text-sm mb-3">Выберите студента для назначения старостой:</p>
            {students.filter(s => !s.is_headman).map((student) => (
              <div
                key={student.id}
                className="bg-white/5 rounded-lg p-4 border border-white/10 hover:bg-white/10 transition-colors flex items-center justify-between"
              >
                <div>
                  <div className="text-white font-medium">{student.name}</div>
                  <div className="text-white/60 text-sm">{student.email}</div>
                </div>
                <button
                  onClick={() => handleSetHeadman(student.id, true)}
                  className="bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 px-4 py-2 rounded-lg transition-colors text-sm"
                >
                  Назначить старостой
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroupStatsPage;
