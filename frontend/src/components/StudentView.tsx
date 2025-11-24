import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api, StudentStats, Grade, Course } from '../services/api';
import { formatGrade } from '../utils/rounding';
import { generateGroupHash } from '../utils/groupHash';
import ReactMarkdown from 'react-markdown';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const StudentView: React.FC = () => {
  const { hashId } = useParams<{ hashId?: string }>();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [achievements, setAchievements] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null);
  const [showGradesDetail, setShowGradesDetail] = useState(false);
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [adviceType, setAdviceType] = useState<'pleasant' | 'useful'>('pleasant');

  const loadMyStats = useCallback(async () => {
    try {
      const [statsData, gradesData, coursesData] = await Promise.all([
        api.getMyStudentStats(),
        api.getStudentGrades(user!.student_id!),
        api.getCourses(),
      ]);

      setStats(statsData);
      setGrades(gradesData);
      setCourses(coursesData);
      
      // Загружаем достижения только для студента
      if (user?.role === 'student') {
        try {
          const achievementsData = await api.getStudentAchievements(user.student_id!);
          setAchievements(achievementsData);
        } catch (error) {
          // Администратор не может видеть достижения
          console.log('Achievements not available');
        }
      }
      
      // ИИ-совет теперь загружается только по кнопке
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading data:', error);
      setLoading(false);
    }
  }, [user]);

  const loadAIAdvice = useCallback(async (type: 'pleasant' | 'useful' = adviceType) => {
    if (user?.role === 'student' && user.student_id) {
      setLoadingAdvice(true);
      setAdviceType(type);
      try {
        const response = await api.getAIStudentAdvice(type);
        setAiAdvice(response.advice);
      } catch (error) {
        console.error('Error loading AI advice:', error);
        setAiAdvice(null);
      } finally {
        setLoadingAdvice(false);
      }
    }
  }, [user, adviceType]);

  const loadAIAdviceForStudent = useCallback(async (studentId: number, type: 'pleasant' | 'useful' = adviceType) => {
    setLoadingAdvice(true);
    setAdviceType(type);
    try {
      const response = await api.getAIStudentAdviceById(studentId, type);
      setAiAdvice(response.advice);
    } catch (error) {
      console.error('Error loading AI advice:', error);
      setAiAdvice(null);
    } finally {
      setLoadingAdvice(false);
    }
  }, [adviceType]);

  const loadStudentByHash = useCallback(async () => {
    try {
      const statsData = await api.getStudentByHash(hashId!);
      setStats(statsData);
      
      // Загружаем оценки и курсы
      const [gradesData, coursesData] = await Promise.all([
        api.getStudentGrades(statsData.student.id),
        api.getCourses(),
      ]);

      setGrades(gradesData);
      setCourses(coursesData);
      
      // Достижения только для студента и преподавателя (не для админа)
      if (user?.role !== 'admin') {
        try {
          const achievementsData = await api.getStudentAchievements(statsData.student.id);
          setAchievements(achievementsData);
        } catch (error) {
          console.log('Achievements not available');
        }
      }
      
      // ИИ-совет теперь загружается только по кнопке
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading data:', error);
      setLoading(false);
    }
  }, [hashId, user]);

  useEffect(() => {
    // Если студент и нет hashId, загружаем его статистику
    if (user?.role === 'student' && !hashId) {
      loadMyStats();
    } else if (hashId) {
      loadStudentByHash();
    } else if (user?.role !== 'student') {
      // Если не студент и нет hashId, перенаправляем на дашборд
      navigate('/');
    }
  }, [hashId, user, loadMyStats, loadStudentByHash, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white text-xl">Загрузка...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white text-xl">Студент не найден</div>
      </div>
    );
  }

  // Группировка оценок по курсам
  const gradesByCourse = grades.reduce((acc: any, grade) => {
    const course = courses.find(c => c.id === grade.course_id);
    const courseName = course?.name || `Курс ${grade.course_id}`;
    if (!acc[courseName]) {
      acc[courseName] = { course, grades: [] };
    }
    acc[courseName].grades.push(grade);
    return acc;
  }, {});

  const courseAverages = Object.entries(gradesByCourse).map(([courseName, data]: [string, any]) => ({
    course: courseName,
    courseId: data.course?.id,
    average: Math.round((data.grades.reduce((sum: number, g: Grade) => sum + g.value, 0) / data.grades.length) * 100) / 100,
    count: data.grades.length,
  }));

  // График оценок по времени
  // Если все оценки за одну дату, показываем каждую оценку отдельно
  const gradesWithDates = grades.filter(g => g.date);
  const uniqueDates = new Set(gradesWithDates.map(g => g.date));
  
  // Группируем оценки по датам и курсам, чтобы сохранить информацию о курсе для фильтрации
  // Используем комбинацию дата+курс как ключ
  const gradesByDateAndCourse = gradesWithDates.reduce((acc: any, grade) => {
    const date = grade.date!;
    const courseId = grade.course_id;
    const key = `${date}_${courseId}`;
    
    if (!acc[key]) {
      acc[key] = {
        date: date,
        course_id: courseId,
        values: []
      };
    }
    acc[key].values.push(grade.value);
    return acc;
  }, {});

  const gradesTimeline = Object.values(gradesByDateAndCourse)
    .map((item: any) => ({
      date: new Date(item.date).toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' }),
      grade: item.values.reduce((a: number, b: number) => a + b, 0) / item.values.length,
      type: '',
      course: '',
      course_id: item.course_id,
      originalDate: item.date,
    }))
    .sort((a, b) => {
      // Сортируем сначала по дате, потом по course_id для стабильности
      const dateDiff = new Date(a.originalDate).getTime() - new Date(b.originalDate).getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.course_id - b.course_id;
    });

  // Вычисляем тренд успеваемости (сравниваем последние оценки с предыдущими)
  const calculateGradeTrend = () => {
    if (grades.length < 2) return null;
    
    const sortedGrades = [...grades]
      .filter(g => g.date)
      .sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateB - dateA; // Сортируем от новых к старым
      });
    
    if (sortedGrades.length < 2) return null;
    
    const recentCount = Math.min(5, Math.floor(sortedGrades.length / 2));
    const olderCount = Math.min(5, sortedGrades.length - recentCount);
    
    const recentAvg = Math.round((sortedGrades.slice(0, recentCount)
      .reduce((sum, g) => sum + g.value, 0) / recentCount) * 100) / 100;
    const olderAvg = Math.round((sortedGrades.slice(recentCount, recentCount + olderCount)
      .reduce((sum, g) => sum + g.value, 0) / olderCount) * 100) / 100;
    
    const trend = recentAvg - olderAvg;
    return {
      value: trend,
      percentage: (trend / olderAvg) * 100,
      recentAvg,
      olderAvg,
    };
  };
  
  const gradeTrend = calculateGradeTrend();
  
  // Статистика по типам оценок
  const gradeTypeStats = grades.reduce((acc: any, grade) => {
    const type = grade.type || 'Другое';
    if (!acc[type]) {
      acc[type] = { count: 0, sum: 0, avg: 0 };
    }
    acc[type].count++;
    acc[type].sum += grade.value;
    acc[type].avg = Math.round((acc[type].sum / acc[type].count) * 100) / 100;
    return acc;
  }, {});
  
  const gradeTypeArray = Object.entries(gradeTypeStats)
    .map(([type, data]: [string, any]) => ({
      type,
      count: data.count,
      average: data.avg,
    }))
    .sort((a, b) => b.count - a.count);

  const getBurnoutColor = (risk?: number) => {
    if (!risk) return 'text-white/60';
    if (risk < 0.3) return 'text-green-400';
    if (risk < 0.6) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getBurnoutLabel = (risk?: number) => {
    if (!risk) return 'Не рассчитан';
    if (risk < 0.3) return 'Низкий';
    if (risk < 0.6) return 'Средний';
    return 'Высокий';
  };

  // Функция для определения цвета посещаемости
  const getAttendanceColor = (rate: number): string => {
    if (rate >= 90) return 'text-green-400';
    if (rate >= 70) return 'text-blue-400';
    return 'text-red-400';
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Навбар для студента */}
      {user?.role === 'student' && (
        <nav className="bg-white/10 backdrop-blur-lg border-b border-white/20 mb-8 rounded-lg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16 items-center">
              <div className="flex items-center">
                <Link to="/" className="flex items-center space-x-2">
                  <span className="text-xl font-bold text-white">MIREA SYNAPSE</span>
                </Link>
              </div>
              <div className="flex items-center space-x-4">
                {stats?.student.is_headman && stats?.student.group && (
                  <Link
                    to={`/group/${generateGroupHash(stats.student.group)}`}
                    className="px-4 py-2 bg-yellow-500/20 rounded-lg text-yellow-300 hover:bg-yellow-500/30 transition-colors text-sm font-medium"
                  >
                     Статистика группы
                  </Link>
                )}
                <span className="text-white/80 text-sm">
                  {user?.email} (Студент)
                </span>
                <button
                  onClick={logout}
                  className="px-4 py-2 bg-red-500/20 rounded-lg text-white hover:bg-red-500/30 transition-colors text-sm"
                >
                  Выйти
                </button>
              </div>
            </div>
          </div>
        </nav>
      )}

      {user?.role !== 'student' && (
        <Link to="/" className="text-white/80 hover:text-white mb-4 inline-block">
          ← Назад к дашборду
        </Link>
      )}

      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-4xl font-bold text-white mb-2">{stats.student.name}</h1>
            <p className="text-white/80">
              {user?.role === 'admin' && stats.student.group ? (
                <>
                  <Link
                    to={`/group/${generateGroupHash(stats.student.group)}`}
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    {stats.student.group}
                  </Link>
                  {' • '}
                </>
              ) : (
                <>
                  {stats.student.group}
                  {stats.student.is_headman && (
                    <span className="ml-2 px-2 py-1 bg-yellow-500/20 text-yellow-300 rounded text-sm font-medium">
                      Староста
                    </span>
                  )}
                  {' • '}
                </>
              )}
              {stats.student.year} курс • {stats.student.email}
            </p>
          </div>
          {/* {user?.role === 'student' && stats.student.is_headman && stats.student.group && (
            <Link
              to={`/group/${generateGroupHash(stats.student.group)}`}
              className="px-6 py-3 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 rounded-lg text-yellow-300 font-medium transition-colors flex items-center gap-2"
            >
              <span></span>
              <span>Статистика группы</span>
            </Link>
          )} */}
        </div>
      </div>

      {/* Основные метрики */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard
          title="Средний балл (GPA)"
          value={formatGrade(stats.gpa)}
          icon=""
          color="bg-yellow-500"
          valueColor="text-yellow-400"
          tooltip="GPA (Grade Point Average) - средний балл успеваемости. Рассчитывается как среднее арифметическое всех оценок."
          onClick={() => setShowGradesDetail(true)}
          clickable
        />
        <MetricCard
          title="Посещаемость"
          value={`${stats.attendance_rate.toFixed(1)}%`}
          icon=""
          color="bg-green-500"
          valueColor={getAttendanceColor(stats.attendance_rate)}
          clickable
          onClick={() => {
            if (user?.role === 'student') {
              navigate('/attendance');
            } else if (hashId) {
              navigate(`/attendance/${hashId}`);
            } else if (stats.student?.hash_id) {
              navigate(`/attendance/${stats.student.hash_id}`);
            }
          }}
        />
        <MetricCard
          title="Достижения"
          value={stats.achievements_count}
          icon=""
          color="bg-purple-500"
          valueColor="text-purple-400"
          clickable
          onClick={() => {
            if (user?.role === 'student') {
              navigate('/achievements');
            }
          }}
        />
      </div>

      {/* Рейтинг (только для студента) */}
      {user?.role === 'student' && stats.rank && (
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 mb-8">
          <h2 className="text-xl font-bold text-white mb-2">Ваше место в рейтинге</h2>
          <p className="text-white/80">
            Вы занимаете <span className="font-bold text-yellow-400">{stats.rank}</span> место из {stats.total_students} студентов
          </p>
        </div>
      )}

      {/* AI Предсказания */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h3 className="text-lg font-bold text-white mb-2">Риск выгорания</h3>
          <div className={`text-4xl font-bold mb-2 ${getBurnoutColor(stats.burnout_risk)}`}>
            {stats.burnout_risk ? (stats.burnout_risk * 100).toFixed(0) : '—'}%
          </div>
          <p className={`text-sm ${getBurnoutColor(stats.burnout_risk)} mb-2`}>
            {getBurnoutLabel(stats.burnout_risk)}
          </p>
          <p className="text-white/60 text-xs">
            Рассчитывается на основе нагрузки (количество дедлайнов), посещаемости, активности в LMS и динамики успеваемости.
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h3 className="text-lg font-bold text-white mb-2">Вероятность успеха</h3>
          <div className="text-4xl font-bold text-green-400 mb-2">
            {stats.success_probability ? (stats.success_probability * 100).toFixed(0) : '—'}%
          </div>
          <p className="text-sm text-white/60 mb-2">
            Прогноз успешного завершения семестра
          </p>
          <p className="text-white/60 text-xs">
            Учитывает средний балл, посещаемость и стабильность оценок.
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h3 className="text-lg font-bold text-white mb-2">Прогноз GPA</h3>
          <div className="text-4xl font-bold text-blue-400 mb-2">
            {stats.predicted_gpa ? formatGrade(stats.predicted_gpa) : '—'}
          </div>
          <p className="text-sm text-white/60 mb-2">
            Предсказанный итоговый балл
          </p>
          <p className="text-white/60 text-xs">
            Основан на текущих оценках и трендах успеваемости.
          </p>
        </div>
      </div>

      {/* Графики */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Оценки по курсам */}
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h2 className="text-xl font-bold text-white mb-4">Средние оценки по курсам</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={courseAverages}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
              <XAxis dataKey="course" stroke="#ffffff80" angle={-45} textAnchor="end" height={100} />
              <YAxis stroke="#ffffff80" domain={[0, 5]} />
              <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
              <Bar dataKey="average" fill="#60a5fa" />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-2">
            {courseAverages.map((item) => (
              <Link
                key={item.courseId}
                to={`/course/${item.courseId}`}
                className="block p-2 bg-white/5 rounded hover:bg-white/10 text-white text-sm"
              >
                {item.course} - {formatGrade(item.average)} ({item.count} оценок)
              </Link>
            ))}
          </div>
        </div>

        {/* Общий профиль - детальная статистика */}
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h2 className="text-xl font-bold text-white mb-4">Общий профиль</h2>
          
          <div className="space-y-6">
            {/* Успеваемость */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/80 text-sm font-medium">Успеваемость (GPA)</span>
                <span className="text-yellow-400 font-bold text-lg">{formatGrade(stats.gpa)}</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-3 mb-2">
                <div
                  className="bg-yellow-400 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${(stats.gpa / 5) * 100}%` }}
                />
              </div>
              {gradeTrend && (
                <div className="flex items-center gap-2 text-xs">
                  <span className={`${gradeTrend.value >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {gradeTrend.value >= 0 ? '↑' : '↓'} {Math.abs(gradeTrend.value).toFixed(2)}
                  </span>
                  <span className="text-white/60">
                    ({gradeTrend.recentAvg.toFixed(2)} vs {gradeTrend.olderAvg.toFixed(2)})
                  </span>
                  <span className="text-white/60">
                    Тренд за последние {Math.min(5, Math.floor(grades.filter(g => g.date).length / 2))} оценок
                  </span>
                </div>
              )}
            </div>
            
            {/* Посещаемость */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/80 text-sm font-medium">Посещаемость</span>
                <span className={`font-bold text-lg ${getAttendanceColor(stats.attendance_rate)}`}>
                  {stats.attendance_rate.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-3 mb-2">
                <div
                  className={`h-3 rounded-full transition-all duration-500 ${
                    stats.attendance_rate >= 90 ? 'bg-green-400' :
                    stats.attendance_rate >= 70 ? 'bg-blue-400' : 'bg-red-400'
                  }`}
                  style={{ width: `${stats.attendance_rate}%` }}
                />
              </div>
              <div className="text-xs text-white/60">
                {stats.attendance_rate >= 90 ? 'Отличная посещаемость' :
                 stats.attendance_rate >= 70 ? 'Хорошая посещаемость' :
                 'Требуется улучшение'}
              </div>
            </div>
            
            {/* Достижения */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/80 text-sm font-medium">Достижения</span>
                <span className="text-purple-400 font-bold text-lg">
                  {stats.achievements_count} {stats.achievements_count === 1 ? 'достижение' : 
                   stats.achievements_count < 5 ? 'достижения' : 'достижений'}
                </span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-3 mb-2">
                <div
                  className="bg-purple-400 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((stats.achievements_count / 10) * 100, 100)}%` }}
                />
              </div>
              <div className="text-xs text-white/60">
                {achievements?.total_points ? `${achievements.total_points} очков заработано` : 'Нет достижений'}
              </div>
            </div>
            
            {/* Статистика по типам оценок */}
            {gradeTypeArray.length > 0 && (
              <div className="pt-4 border-t border-white/10">
                <h3 className="text-white/80 text-sm font-medium mb-3">Оценки по типам</h3>
                <div className="space-y-2">
                  {gradeTypeArray.slice(0, 4).map((item) => (
                    <div key={item.type} className="flex items-center justify-between">
                      <span className="text-white/70 text-xs">{item.type}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-white/60 text-xs">{item.count} шт.</span>
                        <span className="text-yellow-400 text-xs font-medium">
                          {formatGrade(item.average)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Общая активность */}
            <div className="pt-4 border-t border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/80 text-sm font-medium">Активность</span>
                <span className="text-blue-400 font-bold text-lg">{grades.length}</span>
              </div>
              <div className="text-xs text-white/60">
                Всего оценок получено • {courses.length} курсов изучается
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Достижения */}
      {achievements && achievements.achievements.length > 0 && (
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">
              Достижения ({achievements.total_points} очков)
            </h2>
            {user?.role === 'student' && (
              <Link
                to="/achievements"
                className="text-blue-400 hover:text-blue-300 text-sm"
              >
                Все достижения →
              </Link>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {achievements.achievements.map((ach: any) => (
              <div
                key={ach.id}
                className="bg-white/5 rounded-lg p-4 border border-white/10"
              >
                <div className="flex items-center space-x-3">
                  <div className="text-3xl">{ach.icon}</div>
                  <div>
                    <div className="text-white font-medium">{ach.name}</div>
                    <div className="text-white/60 text-sm">{ach.description}</div>
                    <div className="text-yellow-400 text-sm mt-1">+{ach.points} очков</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* История оценок */}
      <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
        <h2 className="text-xl font-bold text-white mb-4">История оценок</h2>
        {gradesTimeline.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-white/60 text-lg">Оценок нет</p>
          </div>
        ) : (
          <>
            <div className="mb-4">
              {/* Фильтр по курсу */}
              <select
                value={selectedCourse || ''}
                onChange={(e) => setSelectedCourse(e.target.value ? Number(e.target.value) : null)}
                className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white w-full md:w-auto"
              >
                <option value="">Все курсы</option>
                {/* Показываем только курсы, по которым есть оценки */}
                {courseAverages.map((item) => (
                  <option key={item.courseId} value={item.courseId}>
                    {item.course} (Средний: {formatGrade(item.average)})
                  </option>
                ))}
              </select>
            </div>
            
            {(() => {
              // Фильтруем по курсу, если выбран
              const filteredTimeline = gradesTimeline.filter(g => !selectedCourse || g.course_id === selectedCourse);
              
              if (filteredTimeline.length === 0) {
                return (
                  <div className="text-center py-16">
                    <div className="bg-white/5 rounded-lg p-8 border border-white/10">
                      <p className="text-white/80 text-lg mb-2">Нет оценок по выбранному курсу</p>
                      {selectedCourse && (
                        <button
                          onClick={() => setSelectedCourse(null)}
                          className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg text-blue-300 text-sm transition-colors mt-2"
                        >
                          Показать все курсы
                        </button>
                      )}
                    </div>
                  </div>
                );
              }
              
              return (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart 
                    data={filteredTimeline}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#ffffff80"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis stroke="#ffffff80" domain={[0, 5]} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                      labelFormatter={(value) => {
                        const item = filteredTimeline.find(g => g.date === value);
                        return item?.originalDate ? new Date(item.originalDate).toLocaleDateString('ru-RU') : value;
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="grade"
                      stroke="#60a5fa"
                      strokeWidth={2}
                      dot={{ r: 4, fill: '#60a5fa' }}
                      activeDot={{ r: 6 }}
                      name="Оценки"
                    />
                  </LineChart>
                </ResponsiveContainer>
              );
            })()}
          </>
        )}
      </div>

      {/* Модальные окна для детализации */}
      {showGradesDetail && (
        <GradesDetailModal
          grades={grades}
          courses={courses}
          onClose={() => setShowGradesDetail(false)}
        />
      )}

      {/* Список курсов студента */}
      {user?.role === 'student' && courseAverages.length > 0 && (
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 mt-8">
          <h2 className="text-2xl font-bold text-white mb-6">Мои курсы</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {courseAverages.map((item) => (
              <Link
                key={item.courseId}
                to={`/course/${item.courseId}`}
                className="bg-white/5 rounded-lg p-4 border border-white/10 hover:bg-white/10 transition-colors"
              >
                <div className="text-white font-medium mb-2">{item.course}</div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-sm">Средний балл:</span>
                  <span className="text-yellow-400 font-bold text-lg">
                    {formatGrade(item.average)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-white/60 text-sm">Оценок:</span>
                  <span className="text-white/80 font-medium">{item.count}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ИИ-совет */}
      {(user?.role === 'student' || hashId) && (
        <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 backdrop-blur-lg rounded-xl p-6 border border-blue-500/30 shadow-lg mt-8">
          <div className="flex items-start gap-4">
            <div className="text-3xl flex-shrink-0">🤖</div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-bold text-white">Совет от ИИ</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (user?.role === 'student' && user.student_id) {
                        loadAIAdvice('pleasant');
                      } else if (hashId && stats?.student.id) {
                        loadAIAdviceForStudent(stats.student.id, 'pleasant');
                      }
                    }}
                    disabled={loadingAdvice}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      adviceType === 'pleasant'
                        ? 'bg-blue-500 text-white'
                        : 'bg-white/10 text-white/80 hover:bg-white/20'
                    } ${loadingAdvice ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    Приятный совет
                  </button>
                  <button
                    onClick={() => {
                      if (user?.role === 'student' && user.student_id) {
                        loadAIAdvice('useful');
                      } else if (hashId && stats?.student.id) {
                        loadAIAdviceForStudent(stats.student.id, 'useful');
                      }
                    }}
                    disabled={loadingAdvice}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      adviceType === 'useful'
                        ? 'bg-purple-500 text-white'
                        : 'bg-white/10 text-white/80 hover:bg-white/20'
                    } ${loadingAdvice ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    Полезный совет
                  </button>
                  <button
                    onClick={() => {
                      if (user?.role === 'student' && user.student_id) {
                        loadAIAdvice(adviceType);
                      } else if (hashId && stats?.student.id) {
                        loadAIAdviceForStudent(stats.student.id, adviceType);
                      }
                    }}
                    disabled={loadingAdvice}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white/80 hover:text-white transition-colors text-sm"
                    title="Перегенерировать совет"
                  >
                    🔄
                  </button>
                </div>
              </div>
              {loadingAdvice ? (
                <div className="text-white/60 flex items-center gap-2">
                  <div className="animate-spin">⏳</div>
                  <span>Генерация совета...</span>
                </div>
              ) : aiAdvice ? (
                <div className="markdown-content">
                  <ReactMarkdown
                    components={{
                      p: ({ node, ...props }) => <p className="text-white/90 leading-relaxed mb-3" {...props} />,
                      strong: ({ node, ...props }) => <strong className="text-white font-semibold" {...props} />,
                      em: ({ node, ...props }) => <em className="text-white/80 italic" {...props} />,
                      ul: ({ node, ...props }) => (
                        <ul className="list-disc text-white/90 space-y-2 my-3 ml-6" {...props} />
                      ),
                      ol: ({ node, ...props }) => (
                        <ol className="list-decimal text-white/90 space-y-2 my-3 ml-6" {...props} />
                      ),
                      li: ({ node, ...props }) => (
                        <li className="text-white/90 leading-relaxed mb-1.5" {...props} />
                      ),
                      h1: ({ node, ...props }) => <h1 className="text-white text-xl font-bold mb-3 mt-4" {...props} />,
                      h2: ({ node, ...props }) => <h2 className="text-white text-lg font-bold mb-2 mt-3" {...props} />,
                      h3: ({ node, ...props }) => <h3 className="text-white text-base font-semibold mb-2 mt-2" {...props} />,
                      code: ({ node, ...props }) => <code className="bg-white/10 text-yellow-300 px-1.5 py-0.5 rounded text-sm font-mono" {...props} />,
                      blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-blue-500/50 pl-4 italic text-white/80 my-3" {...props} />,
                    }}
                  >
                    {aiAdvice}
                  </ReactMarkdown>
                  {adviceType === 'useful' && (
                    <p className="text-white/60 text-xs mt-4 pt-3 border-t border-white/10">
                      💡 Полезный совет анализирует ваши оценки по каждому предмету и дает конкретные рекомендации
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-white/60 text-sm mb-3">
                    Выберите тип совета и нажмите кнопку для генерации персональных рекомендаций на основе вашей успеваемости.
                  </p>
                  <div className="flex gap-2 text-xs text-white/50">
                    <span>💡 Приятный совет — мотивирующий и общий</span>
                    <span>•</span>
                    <span> Полезный совет — детальный анализ по предметам</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MetricCard: React.FC<{
  title: string;
  value: string | number;
  icon: string;
  color: string;
  valueColor?: string;
  tooltip?: string;
  onClick?: () => void;
  clickable?: boolean;
}> = ({ title, value, icon, color, valueColor = 'text-white', tooltip, onClick, clickable }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className={`bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 relative ${clickable ? 'cursor-pointer hover:bg-white/15' : ''}`}
      onClick={onClick}
    >
      <div className="text-center">
        <div className="flex items-center justify-center space-x-2 mb-2">
          <p className="text-white/60 text-sm">{title}</p>
          {tooltip && (
            <div
              className="relative"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
            >
              <span className="text-white/60 cursor-help text-xs font-bold bg-white/10 rounded-full w-4 h-4 flex items-center justify-center">i</span>
              {showTooltip && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg z-10">
                  {tooltip}
                </div>
              )}
            </div>
          )}
        </div>
        <p className={`text-3xl font-bold ${valueColor}`}>{value}</p>
      </div>
    </div>
  );
};

// Компонент для курса с выпадашкой
const CourseGradesCollapsible: React.FC<{
  courseName: string;
  courseGrades: Grade[];
  courseId?: number;
}> = ({ courseName, courseGrades, courseId }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Вычисляем средний балл по курсу
  const courseAvg = courseGrades.length > 0
    ? Math.round((courseGrades.reduce((sum: number, g: Grade) => sum + g.value, 0) / courseGrades.length) * 100) / 100
    : 0;
  
  // Функция для получения цвета оценки по типу
  const getGradeColor = (type?: string) => {
    if (!type) return 'bg-gray-500/20 border-gray-500/50';
    const typeLower = type.toLowerCase();
    if (typeLower.includes('exam') || typeLower.includes('экзамен')) {
      return 'bg-red-500/20 border-red-500/50'; // Красный - самый важный
    } else if (typeLower.includes('test') || typeLower.includes('зачет')) {
      return 'bg-orange-500/20 border-orange-500/50'; // Оранжевый
    } else if (typeLower.includes('coursework') || typeLower.includes('курсовая')) {
      return 'bg-green-500/20 border-green-500/50'; // Зеленый
    } else {
      return 'bg-gray-500/20 border-gray-500/50'; // Серая - домашняя работа
    }
  };
  
  return (
    <div className="bg-white/5 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-1 flex items-center justify-between text-white font-medium hover:text-blue-400 transition-colors"
        >
          <span className="flex items-center gap-2">
            <span>{isExpanded ? '▼' : '▶'}</span>
            <span>{courseName}</span>
            <span className="text-white/60 text-sm font-normal">
              (Средний: {formatGrade(courseAvg)}, оценок: {courseGrades.length})
            </span>
          </span>
        </button>
        {courseId && (
          <Link
            to={`/course/${courseId}`}
            className="ml-2 px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg text-blue-300 text-xs transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            Курс →
          </Link>
        )}
      </div>
      {isExpanded && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
          {courseGrades.map((grade: Grade) => (
            <div
              key={grade.id}
              className={`${getGradeColor(grade.type)} rounded p-2 text-center border`}
            >
              <div className="text-white font-bold text-lg">{grade.value}</div>
              <div className="text-white/80 text-xs mt-1">
                {grade.type || 'Не указано'}
              </div>
              {grade.date && (
                <div className="text-white/60 text-xs mt-1">{grade.date}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const GradesDetailModal: React.FC<{
  grades: Grade[];
  courses: Course[];
  onClose: () => void;
}> = ({ grades, courses, onClose }) => {
  const gradesByCourse = grades.reduce((acc: any, grade) => {
    const course = courses.find(c => c.id === grade.course_id);
    const courseName = course?.name || `Курс ${grade.course_id}`;
    if (!acc[courseName]) {
      acc[courseName] = { course, grades: [] };
    }
    acc[courseName].grades.push(grade);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 rounded-xl p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-white">Все оценки по предметам</h2>
          <button onClick={onClose} className="text-white/60 hover:text-white">✕</button>
        </div>
        <div className="space-y-4">
          {Object.entries(gradesByCourse).map(([courseName, data]: [string, any]) => (
            <CourseGradesCollapsible
              key={courseName}
              courseName={courseName}
              courseGrades={data.grades}
              courseId={data.course?.id}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default StudentView;
