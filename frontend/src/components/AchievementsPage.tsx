import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api, Course } from '../services/api';

interface Achievement {
  id: number;
  achievement_template_id?: number;
  name: string;
  description?: string;
  icon?: string;
  points: number;
  unlocked_at?: string;
  course_id?: number;
  course_name?: string;
}

const AchievementsPage: React.FC = () => {
  const { user } = useAuth();
  const [allAchievements, setAllAchievements] = useState<Achievement[]>([]);
  const [earnedAchievements, setEarnedAchievements] = useState<Achievement[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCourse, setFilterCourse] = useState<number | null>(null);
  const [filterEarned, setFilterEarned] = useState<boolean | null>(null); // null = все, true = полученные, false = не полученные

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      if (user?.role === 'student' && user.student_id) {
        // Загружаем все доступные достижения (шаблоны)
        const allAchievementsData = await api.getAllAchievements();
        
        // Загружаем полученные достижения студента
        const earnedData = await api.getStudentAchievements(user.student_id);
        const earnedList = earnedData.achievements || [];
        
        // Создаем мапу полученных достижений по achievement_template_id или id
        const earnedMap = new Map<number, Achievement>();
        earnedList.forEach((ach: Achievement) => {
          const key = ach.achievement_template_id || ach.id;
          earnedMap.set(key, ach);
        });
        
        // Объединяем все достижения с информацией о получении
        const mergedAchievements = allAchievementsData.map((ach: Achievement) => {
          const earned = earnedMap.get(ach.id);
          return {
            ...ach,
            unlocked_at: earned?.unlocked_at,
            achievement_template_id: ach.id
          };
        });
        
        setAllAchievements(mergedAchievements);
        setEarnedAchievements(earnedList);
      }
      
      // Загружаем курсы для фильтра
      const coursesData = await api.getCourses();
      setCourses(coursesData);
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading achievements:', error);
      setLoading(false);
    }
  };

  // Фильтрация достижений
  const filteredAchievements = allAchievements.filter(ach => {
    if (filterCourse && ach.course_id !== filterCourse) {
      return false;
    }
    if (filterEarned !== null) {
      const isEarned = !!ach.unlocked_at;
      if (filterEarned && !isEarned) return false;
      if (!filterEarned && isEarned) return false;
    }
    return true;
  });

  // Группировка по курсам
  const achievementsByCourse: { [key: string]: Achievement[] } = {};
  filteredAchievements.forEach(ach => {
    const courseKey = ach.course_name || 'Общие достижения';
    if (!achievementsByCourse[courseKey]) {
      achievementsByCourse[courseKey] = [];
    }
    achievementsByCourse[courseKey].push(ach);
  });

  const totalPoints = filteredAchievements
    .filter(ach => ach.unlocked_at)
    .reduce((sum, ach) => sum + ach.points, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white text-xl">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Link to="/" className="text-white/80 hover:text-white mb-4 inline-block">
        ← Назад
      </Link>

      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Достижения</h1>
        <p className="text-white/80">Ваши достижения и награды</p>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h3 className="text-lg font-bold text-white mb-2">Всего достижений</h3>
          <div className="text-4xl font-bold text-yellow-400">
            {filteredAchievements.filter(ach => ach.unlocked_at).length} / {filteredAchievements.length}
          </div>
        </div>
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h3 className="text-lg font-bold text-white mb-2">Всего очков</h3>
          <div className="text-4xl font-bold text-purple-400">{totalPoints}</div>
        </div>
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h3 className="text-lg font-bold text-white mb-2">Прогресс</h3>
          <div className="text-4xl font-bold text-green-400">
            {filteredAchievements.length > 0
              ? Math.round((filteredAchievements.filter(ach => ach.unlocked_at).length / filteredAchievements.length) * 100)
              : 0}%
          </div>
        </div>
      </div>

      {/* Фильтры */}
      <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 mb-8">
        <h2 className="text-xl font-bold text-white mb-4">Фильтры</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-white mb-2">Курс:</label>
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
          <div>
            <label className="block text-white mb-2">Статус:</label>
            <select
              value={filterEarned === null ? '' : filterEarned ? 'earned' : 'not-earned'}
              onChange={(e) => {
                if (e.target.value === '') setFilterEarned(null);
                else setFilterEarned(e.target.value === 'earned');
              }}
              className="w-full bg-white/10 backdrop-blur-lg border border-white/20 rounded-lg px-4 py-2 text-white"
            >
              <option value="">Все достижения</option>
              <option value="earned">Полученные</option>
              <option value="not-earned">Не полученные</option>
            </select>
          </div>
        </div>
      </div>

      {/* Достижения по курсам */}
      {Object.keys(achievementsByCourse).length === 0 ? (
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 text-center">
          <p className="text-white/60 text-lg">Достижений не найдено</p>
        </div>
      ) : (
        Object.entries(achievementsByCourse).map(([courseName, courseAchievements]) => (
          <div key={courseName} className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">{courseName}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {courseAchievements.map((achievement) => {
                const isEarned = !!achievement.unlocked_at;
                return (
                  <div
                    key={achievement.id}
                    className={`bg-white/10 backdrop-blur-lg rounded-xl p-6 border ${
                      isEarned
                        ? 'border-yellow-500/50 bg-yellow-500/10'
                        : 'border-white/20 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-white mb-1">{achievement.name}</h3>
                        {achievement.description && (
                          <p className="text-white/60 text-sm mb-2">{achievement.description}</p>
                        )}
                      </div>
                      <div className={`text-2xl ${isEarned ? '' : 'grayscale opacity-50'}`}>
                        {achievement.icon || ''}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-yellow-400 font-semibold">{achievement.points} очков</span>
                      {isEarned && achievement.unlocked_at && (
                        <span className="text-white/60 text-xs">
                          Получено: {new Date(achievement.unlocked_at).toLocaleDateString('ru-RU')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default AchievementsPage;

