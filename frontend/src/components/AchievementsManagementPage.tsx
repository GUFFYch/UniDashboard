import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api, Course, Student } from '../services/api';

interface Achievement {
  id: number;
  name: string;
  description?: string;
  icon?: string;
  points: number;
  course_id?: number;
  course_name?: string;
  total_earned: number;
  deleted?: boolean;
  created_by_id?: number;
  is_public?: boolean;
}

const AchievementsManagementPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [showStudentsList, setShowStudentsList] = useState(false);
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
  const [filterCourse, setFilterCourse] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [achievementStudents, setAchievementStudents] = useState<any>(null);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [showStudentSelector, setShowStudentSelector] = useState(false);
  const [studentSearchQuery, setStudentSearchQuery] = useState<string>('');

  // Форма создания
  const [newAchievement, setNewAchievement] = useState({
    name: '',
    description: '',
    icon: '🏆',
    points: 0,
    course_id: null as number | null,
    is_public: false,
  });

  // Форма выдачи
  const [assignData, setAssignData] = useState({
    achievement_id: 0,
    student_ids: [] as number[],
    group: '',
    department: '',
    course_id: null as number | null,
    all_students: false,
  });

  useEffect(() => {
    loadData();
  }, [filterCourse]);

  const loadData = async () => {
    try {
      setLoading(true);
      // Загружаем все ачивки (включая удаленные)
      const [allAchievementsData, coursesData, studentsData] = await Promise.all([
        api.getAllAchievements(filterCourse || undefined, true),  // Все (включая удаленные)
        api.getCourses(),
        // Для преподавателя и админа загружаем студентов (бэкенд уже фильтрует для преподавателя)
        user?.role === 'admin' || user?.role === 'teacher' ? api.getStudents() : Promise.resolve([]),
      ]);

      // Фильтруем ачивки: для преподавателя показываем только те, которые связаны с его курсами
      // (бэкенд уже фильтрует, но дополнительно фильтруем на фронтенде для надежности)
      let filteredAchievements = allAchievementsData;
      
      if (user?.role === 'teacher' && coursesData.length > 0) {
        const teacherCourseIds = coursesData.map(c => c.id);
        // Показываем только достижения по курсам преподавателя (не общие)
        filteredAchievements = allAchievementsData.filter((ach: Achievement) => 
          ach.course_id && teacherCourseIds.includes(ach.course_id)
        );
      } else if (user?.role === 'teacher' && coursesData.length === 0) {
        // Если у преподавателя нет курсов, не показываем достижения
        filteredAchievements = [];
      }

      // Убеждаемся, что deleted - это булево значение
      const normalizedAchievements = filteredAchievements.map((ach: Achievement) => ({
        ...ach,
        deleted: Boolean(ach.deleted)
      }));
      
      setAchievements(normalizedAchievements);
      setCourses(coursesData);
      setStudents(studentsData);
      setLoading(false);
    } catch (error) {
      console.error('Error loading data:', error);
      setLoading(false);
    }
  };

  const handleCreateAchievement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createAchievement(newAchievement);
      setShowCreateForm(false);
      setNewAchievement({
        name: '',
        description: '',
        icon: '🏆',
        points: 0,
        course_id: null,
        is_public: false,
      });
      loadData();
    } catch (error) {
      console.error('Error creating achievement:', error);
      alert('Ошибка при создании достижения');
    }
  };

  const handleAssignAchievement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAchievement) return;

    try {
      const result = await api.assignAchievement({
        ...assignData,
        achievement_id: selectedAchievement.id,
      });
      alert(result.message);
      setShowAssignForm(false);
      setSelectedAchievement(null);
      setAssignData({
        achievement_id: 0,
        student_ids: [],
        group: '',
        department: '',
        course_id: null,
        all_students: false,
      });
      setShowStudentSelector(false);
      setStudentSearchQuery('');
      loadData();
    } catch (error: any) {
      console.error('Error assigning achievement:', error);
      alert(error.response?.data?.detail || 'Ошибка при выдаче достижения');
    }
  };

  const handleDeleteAchievement = async (achievementId: number, permanent: boolean = false) => {
    if (!window.confirm(permanent 
      ? 'Вы уверены, что хотите окончательно удалить это достижение? Это действие нельзя отменить.' 
      : 'Вы уверены, что хотите удалить это достижение? Его можно будет восстановить.')) {
      return;
    }

    try {
      const result = await api.deleteAchievement(achievementId, permanent);
      alert(result.message);
      loadData();
    } catch (error: any) {
      console.error('Error deleting achievement:', error);
      alert(error.response?.data?.detail || 'Ошибка при удалении достижения');
    }
  };

  const handleRestoreAchievement = async (achievementId: number) => {
    try {
      const result = await api.restoreAchievement(achievementId);
      alert(result.message);
      loadData();
    } catch (error: any) {
      console.error('Error restoring achievement:', error);
      alert(error.response?.data?.detail || 'Ошибка при восстановлении достижения');
    }
  };

  const handleViewStudents = async (achievementId: number) => {
    try {
      setLoadingStudents(true);
      const data = await api.getAchievementStudents(achievementId);
      setAchievementStudents(data);
      setShowStudentsList(true);
    } catch (error: any) {
      console.error('Error loading students:', error);
      alert(error.response?.data?.detail || 'Ошибка при загрузке списка студентов');
    } finally {
      setLoadingStudents(false);
    }
  };

  const handleRemoveFromStudent = async (achievementId: number, studentId: number, studentName: string) => {
    if (!window.confirm(`Вы уверены, что хотите забрать это достижение у студента ${studentName}?`)) {
      return;
    }

    try {
      const result = await api.removeAchievementFromStudent(achievementId, studentId);
      alert(result.message);
      // Обновляем список студентов
      if (achievementStudents) {
        const updatedStudents = achievementStudents.students.filter(
          (s: any) => s.student_id !== studentId
        );
        setAchievementStudents({
          ...achievementStudents,
          students: updatedStudents
        });
      }
      // Обновляем общий список ачивок
      loadData();
    } catch (error: any) {
      console.error('Error removing achievement:', error);
      alert(error.response?.data?.detail || 'Ошибка при удалении достижения');
    }
  };

  // Функция фильтрации по поисковому запросу
  const filterBySearch = (ach: Achievement) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      ach.name.toLowerCase().includes(query) ||
      (ach.description && ach.description.toLowerCase().includes(query)) ||
      (ach.course_name && ach.course_name.toLowerCase().includes(query)) ||
      (ach.icon && ach.icon.includes(query))
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white text-xl">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Link to={user?.role === 'admin' ? '/admin' : '/teacher'} className="text-white/80 hover:text-white mb-4 inline-block">
        ← Назад
      </Link>

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Управление достижениями</h1>
          <p className="text-white/80">
            {user?.role === 'admin' 
              ? 'Создание и выдача достижений' 
              : 'Создание и выдача достижений по вашим курсам'}
          </p>
        </div>
        {(user?.role === 'admin' || user?.role === 'teacher') && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            + Создать достижение
          </button>
        )}
      </div>

      {/* Фильтры и поиск */}
      <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 mb-8 space-y-4">
        <div>
          <label className="block text-white mb-2">Поиск по достижениям:</label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по названию, описанию или курсу..."
            className="w-full bg-white/10 backdrop-blur-lg border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/40"
          />
        </div>
        <div>
          <label className="block text-white mb-2">Фильтр по курсу:</label>
          <select
            value={filterCourse || ''}
            onChange={(e) => setFilterCourse(e.target.value ? parseInt(e.target.value) : null)}
            className="w-full bg-white/10 backdrop-blur-lg border border-white/20 rounded-lg px-4 py-2 text-white"
          >
            <option value="">Все курсы</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name} {course.code && `(${course.code})`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Активные достижения */}
      {achievements.filter(a => !a.deleted && filterBySearch(a)).length > 0 && (
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">
            Активные достижения
            {searchQuery && (
              <span className="text-white/60 text-lg ml-2">
                (найдено: {achievements.filter(a => !a.deleted && filterBySearch(a)).length})
              </span>
            )}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {achievements.filter(a => !a.deleted && filterBySearch(a)).map((achievement) => (
              <div
                key={achievement.id}
                className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="text-3xl">{achievement.icon || '🏆'}</div>
                    </div>
                    <h3 className="text-xl font-bold mb-1 text-white">
                      {achievement.name}
                    </h3>
                    {achievement.description && (
                      <p className="text-sm mb-2 text-white/60">
                        {achievement.description}
                      </p>
                    )}
                    {achievement.is_public && (
                      <p className="text-sm text-green-400 font-semibold">
                        🌐 Публичное достижение "для всех"
                      </p>
                    )}
                    {achievement.course_name && (
                      <p className="text-sm text-blue-400">
                        Курс: {achievement.course_name}
                      </p>
                    )}
                    <p className="font-semibold mt-2 text-yellow-400">
                      {achievement.points} очков
                    </p>
                    <p className="text-xs mt-1 text-white/60">
                      Получено: {achievement.total_earned} студентами
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {user?.role === 'admin' && (
                    <button
                      onClick={() => handleViewStudents(achievement.id)}
                      className="w-full bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 px-4 py-2 rounded-lg transition-colors"
                    >
                      Просмотр студентов ({achievement.total_earned})
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setSelectedAchievement(achievement);
                      setAssignData({
                        achievement_id: achievement.id,
                        student_ids: [],
                        group: '',
                        department: '',
                        course_id: null,
                        all_students: false,
                      });
                      setShowStudentSelector(false);
                      setStudentSearchQuery('');
                      setShowAssignForm(true);
                    }}
                    className="w-full bg-green-500/20 hover:bg-green-500/30 text-green-300 px-4 py-2 rounded-lg transition-colors"
                  >
                    Выдать достижение
                  </button>
                  {/* Кнопка удаления: только админ или создатель может удалять */}
                  {(user?.role === 'admin' || (user?.role === 'teacher' && achievement.created_by_id === user.teacher_id)) && (
                  <button
                    onClick={() => handleDeleteAchievement(achievement.id, false)}
                    className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-300 px-4 py-2 rounded-lg transition-colors"
                  >
                    Удалить
                  </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Удаленные достижения */}
      {achievements.filter(a => a.deleted && filterBySearch(a)).length > 0 && (
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white/60 mb-4">
            Удаленные достижения
            {searchQuery && (
              <span className="text-white/40 text-lg ml-2">
                (найдено: {achievements.filter(a => a.deleted && filterBySearch(a)).length})
              </span>
            )}
          </h2>
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {achievements.filter(a => a.deleted && filterBySearch(a)).map((achievement) => (
                <div
                  key={achievement.id}
                  className="bg-white/5 rounded-xl p-6 border border-white/10 opacity-75"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="text-3xl opacity-60">{achievement.icon || '🏆'}</div>
                        <span className="bg-red-500/20 text-red-300 text-xs px-2 py-1 rounded">Удалено</span>
                      </div>
                      <h3 className="text-xl font-bold mb-1 text-white/50 line-through">
                        {achievement.name}
                      </h3>
                      {achievement.description && (
                        <p className="text-sm mb-2 text-white/40">
                          {achievement.description}
                        </p>
                      )}
                      {achievement.is_public && (
                        <p className="text-sm text-green-400/60 font-semibold">
                          🌐 Публичное достижение "для всех"
                        </p>
                      )}
                      {achievement.course_name && (
                        <p className="text-sm text-white/40">
                          Курс: {achievement.course_name}
                        </p>
                      )}
                      <p className="font-semibold mt-2 text-white/40">
                        {achievement.points} очков
                      </p>
                      <p className="text-xs mt-1 text-white/40">
                        Получено: {achievement.total_earned} студентами
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {/* Кнопка восстановления: только админ или создатель может восстанавливать */}
                    {(user?.role === 'admin' || (user?.role === 'teacher' && achievement.created_by_id === user.teacher_id)) && (
                    <button
                      onClick={() => handleRestoreAchievement(achievement.id)}
                      className="w-full bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 px-4 py-2 rounded-lg transition-colors"
                    >
                      Вернуть ачивку
                    </button>
                    )}
                    {/* Кнопка окончательного удаления: только админ или создатель может удалять навсегда */}
                    {(user?.role === 'admin' || (user?.role === 'teacher' && achievement.created_by_id === user.teacher_id)) && (
                    <button
                      onClick={() => handleDeleteAchievement(achievement.id, true)}
                      className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-300 px-4 py-2 rounded-lg transition-colors"
                    >
                      Удалить навсегда
                    </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Сообщение, если нет достижений */}
      {achievements.filter(filterBySearch).length === 0 && (
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 text-center">
          <p className="text-white/60 text-lg">
            {searchQuery 
              ? `Достижения по запросу "${searchQuery}" не найдены`
              : 'Достижений пока нет'}
          </p>
        </div>
      )}

      {/* Модальное окно создания достижения */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateForm(false)}>
          <div className="bg-gray-900 rounded-xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-bold text-white mb-4">Создать достижение</h2>
            <form onSubmit={handleCreateAchievement}>
              <div className="space-y-4">
                <div>
                  <label className="block text-white mb-2">Название:</label>
                  <input
                    type="text"
                    value={newAchievement.name}
                    onChange={(e) => setNewAchievement({ ...newAchievement, name: e.target.value })}
                    required
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-white mb-2">Описание:</label>
                  <textarea
                    value={newAchievement.description}
                    onChange={(e) => setNewAchievement({ ...newAchievement, description: e.target.value })}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-white mb-2">Иконка:</label>
                  <input
                    type="text"
                    value={newAchievement.icon}
                    onChange={(e) => setNewAchievement({ ...newAchievement, icon: e.target.value })}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-white mb-2">Очки:</label>
                  <input
                    type="number"
                    value={newAchievement.points}
                    onChange={(e) => setNewAchievement({ ...newAchievement, points: parseInt(e.target.value) })}
                    required
                    min="0"
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="flex items-center space-x-2 text-white mb-2">
                    <input
                      type="checkbox"
                      checked={newAchievement.is_public}
                      onChange={(e) => {
                        setNewAchievement({ 
                          ...newAchievement, 
                          is_public: e.target.checked,
                          course_id: e.target.checked ? null : newAchievement.course_id  // Если публичное, убираем курс
                        });
                      }}
                      className="rounded"
                    />
                    <span>
                      Публичное достижение "для всех"
                      {user?.role === 'teacher' && (
                        <span className="text-white/60 text-sm ml-2">(может выдавать кто угодно)</span>
                      )}
                    </span>
                  </label>
                </div>
                {!newAchievement.is_public && (
                <div>
                  <label className="block text-white mb-2">
                    Курс (опционально):
                    {user?.role === 'teacher' && (
                      <span className="text-white/60 text-sm ml-2">(только ваши курсы)</span>
                    )}
                  </label>
                  <select
                    value={newAchievement.course_id || ''}
                    onChange={(e) => setNewAchievement({ ...newAchievement, course_id: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white"
                  >
                    <option value="">Общее достижение</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.name} {course.code && `(${course.code})`}
                      </option>
                    ))}
                  </select>
                  {user?.role === 'teacher' && courses.length === 0 && (
                    <p className="text-yellow-400 text-sm mt-1">
                      У вас пока нет курсов. Обратитесь к администратору для назначения курсов.
                    </p>
                  )}
                </div>
                )}
              </div>
              <div className="flex gap-4 mt-6">
                <button
                  type="submit"
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Создать
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модальное окно выдачи достижения */}
      {showAssignForm && selectedAchievement && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAssignForm(false)}>
          <div className="bg-gray-900 rounded-xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-bold text-white mb-4">Выдать достижение: {selectedAchievement.name}</h2>
            <form onSubmit={handleAssignAchievement}>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center space-x-2 text-white">
                    <input
                      type="checkbox"
                      checked={assignData.all_students}
                      onChange={(e) => {
                        setAssignData({ ...assignData, all_students: e.target.checked, group: '', department: '', course_id: null, student_ids: [] });
                        setShowStudentSelector(false);
                        setStudentSearchQuery('');
                      }}
                      className="rounded"
                    />
                    <span>
                      Всем студентам
                      {user?.role === 'teacher' && (
                        <span className="text-white/60 text-sm ml-2">(ваших курсов)</span>
                      )}
                    </span>
                  </label>
                </div>
                {!assignData.all_students && (
                  <>
                    <div>
                      <label className="block text-white mb-2">Выбор студентов:</label>
                      <button
                        type="button"
                        onClick={() => setShowStudentSelector(!showStudentSelector)}
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white text-left hover:bg-white/15 transition-colors"
                      >
                        {assignData.student_ids.length > 0 
                          ? `Выбрано студентов: ${assignData.student_ids.length}`
                          : 'Выбрать конкретных студентов'}
                      </button>
                      {assignData.student_ids.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {students
                            .filter(s => assignData.student_ids.includes(s.id))
                            .map(student => (
                              <span
                                key={student.id}
                                className="bg-blue-500/20 text-blue-300 px-2 py-1 rounded text-sm flex items-center gap-2"
                              >
                                {student.name}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAssignData({
                                      ...assignData,
                                      student_ids: assignData.student_ids.filter(id => id !== student.id)
                                    });
                                  }}
                                  className="text-blue-300 hover:text-blue-100"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                    
                    {showStudentSelector && (
                      <div className="bg-white/5 rounded-lg p-4 border border-white/10 max-h-64 overflow-y-auto">
                        <input
                          type="text"
                          placeholder="Поиск студентов..."
                          value={studentSearchQuery}
                          onChange={(e) => setStudentSearchQuery(e.target.value)}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white mb-3"
                        />
                        <div className="space-y-2">
                          {students
                            .filter(student => {
                              if (studentSearchQuery) {
                                const query = studentSearchQuery.toLowerCase();
                                return student.name.toLowerCase().includes(query) ||
                                       student.email.toLowerCase().includes(query) ||
                                       (student.group && student.group.toLowerCase().includes(query));
                              }
                              return true;
                            })
                            .map(student => (
                              <label
                                key={student.id}
                                className="flex items-center space-x-2 p-2 hover:bg-white/5 rounded cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={assignData.student_ids.includes(student.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setAssignData({
                                        ...assignData,
                                        student_ids: [...assignData.student_ids, student.id],
                                        group: '',
                                        department: '',
                                        course_id: null
                                      });
                                    } else {
                                      setAssignData({
                                        ...assignData,
                                        student_ids: assignData.student_ids.filter(id => id !== student.id)
                                      });
                                    }
                                  }}
                                  className="rounded"
                                />
                                <div className="flex-1">
                                  <div className="text-white">{student.name}</div>
                                  <div className="text-white/60 text-sm">{student.email}</div>
                                  {student.group && (
                                    <div className="text-white/40 text-xs">Группа: {student.group}</div>
                                  )}
                                </div>
                              </label>
                            ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="text-white/60 text-sm mb-2">Или выберите по критериям:</div>
                    
                    <div>
                      <label className="block text-white mb-2">Группа:</label>
                      <input
                        type="text"
                        value={assignData.group}
                        onChange={(e) => {
                          setAssignData({ ...assignData, group: e.target.value, department: '', course_id: null, student_ids: [] });
                          setShowStudentSelector(false);
                        }}
                        placeholder="ИТ-1"
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-white mb-2">Кафедра:</label>
                      <select
                        value={assignData.department}
                        onChange={(e) => {
                          setAssignData({ ...assignData, department: e.target.value, group: '', course_id: null, student_ids: [] });
                          setShowStudentSelector(false);
                        }}
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white"
                      >
                        <option value="">Не выбрано</option>
                        <option value="ИТ">ИТ</option>
                        <option value="ПИ">ПИ</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-white mb-2">
                        Курс:
                        {user?.role === 'teacher' && (
                          <span className="text-white/60 text-sm ml-2">(только ваши курсы)</span>
                        )}
                      </label>
                      <select
                        value={assignData.course_id || ''}
                        onChange={(e) => {
                          setAssignData({ ...assignData, course_id: e.target.value ? parseInt(e.target.value) : null, group: '', department: '', student_ids: [] });
                          setShowStudentSelector(false);
                        }}
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white"
                      >
                        <option value="">Не выбрано</option>
                        {/* Для преподавателей показываются только их курсы (фильтрация на бэкенде) */}
                        {courses.map((course) => (
                          <option key={course.id} value={course.id}>
                            {course.name} {course.code && `(${course.code})`}
                          </option>
                        ))}
                      </select>
                      {user?.role === 'teacher' && courses.length === 0 && (
                        <p className="text-yellow-400 text-sm mt-1">У вас нет курсов для выдачи достижений</p>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="flex gap-4 mt-6">
                <button
                  type="submit"
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Выдать
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAssignForm(false);
                    setShowStudentSelector(false);
                    setStudentSearchQuery('');
                    setAssignData({
                      achievement_id: 0,
                      student_ids: [],
                      group: '',
                      department: '',
                      course_id: null,
                      all_students: false,
                    });
                  }}
                  className="flex-1 bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модальное окно со списком студентов */}
      {showStudentsList && achievementStudents && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowStudentsList(false)}>
          <div className="bg-gray-900 rounded-xl p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  {achievementStudents.achievement.icon} {achievementStudents.achievement.name}
                </h2>
                <p className="text-white/60 text-sm">
                  Студенты, получившие это достижение ({achievementStudents.students.length})
                </p>
              </div>
              <button onClick={() => setShowStudentsList(false)} className="text-white/60 hover:text-white text-2xl">✕</button>
            </div>

            {loadingStudents ? (
              <div className="text-center py-8">
                <p className="text-white/60 text-lg">Загрузка...</p>
              </div>
            ) : achievementStudents.students.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-white/60 text-lg">Никто еще не получил это достижение</p>
              </div>
            ) : (
              <div className="space-y-2">
                {achievementStudents.students.map((student: any) => (
                  <div
                    key={`${student.achievement_id}-${student.student_id}`}
                    className="bg-white/5 rounded-lg p-4 border border-white/10 flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <div className="text-white font-medium">{student.student_name}</div>
                      <div className="text-white/60 text-sm">{student.student_email}</div>
                      {student.student_group && (
                        <div className="text-white/60 text-sm">Группа: {student.student_group}</div>
                      )}
                      {student.unlocked_at && (
                        <div className="text-white/40 text-xs mt-1">
                          Получено: {new Date(student.unlocked_at).toLocaleDateString('ru-RU', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveFromStudent(student.achievement_id, student.student_id, student.student_name)}
                      className="ml-4 bg-red-500/20 hover:bg-red-500/30 text-red-300 px-4 py-2 rounded-lg transition-colors text-sm whitespace-nowrap"
                    >
                      Забрать ачивку
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AchievementsManagementPage;

