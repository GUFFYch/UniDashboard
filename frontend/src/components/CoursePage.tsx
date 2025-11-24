import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api, Course, Grade, Student } from '../services/api';
import { formatGrade } from '../utils/rounding';
import { generateGroupHash } from '../utils/groupHash';
import ReactMarkdown from 'react-markdown';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const CoursePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [course, setCourse] = useState<Course | null>(null);
  const [courseStats, setCourseStats] = useState<any>(null);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    // Начинаем с понедельника текущей недели
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Понедельник
    const monday = new Date(today);
    monday.setDate(diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  });
  
  // Получаем параметры фильтрации из URL
  const groupFilter = searchParams.get('group');
  const teacherFilter = searchParams.get('teacher');

  useEffect(() => {
    if (id) {
      loadCourseData(parseInt(id));
    }
  }, [id, groupFilter]);

  const loadCourseData = async (courseId: number) => {
    try {
      setLoading(true);
      
      const [courseData, statsData] = await Promise.all([
        api.getCourses().then(courses => courses.find(c => c.id === courseId)),
        api.getCourseStats(courseId, groupFilter || undefined),
      ]);

      if (!courseData) {
        navigate('/');
        return;
      }

      setCourse(courseData);
      setCourseStats(statsData);

      // Загружаем оценки студента по этому курсу (если студент)
      if (user?.role === 'student' && user.student_id) {
        const gradesData = await api.getStudentGrades(user.student_id, courseId);
        setGrades(gradesData);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading course data:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white text-xl">Загрузка...</div>
      </div>
    );
  }

  if (!course || !courseStats) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-white text-xl">Курс не найден</div>
        <Link to="/" className="text-white/80 hover:text-white mt-4 inline-block">
          ← Назад
        </Link>
      </div>
    );
  }

  // Подготовка данных для графиков
  const gradeDistribution = [
    { grade: '5', count: grades.filter(g => g.value >= 4.5).length },
    { grade: '4', count: grades.filter(g => g.value >= 3.5 && g.value < 4.5).length },
    { grade: '3', count: grades.filter(g => g.value >= 2.5 && g.value < 3.5).length },
    { grade: '2', count: grades.filter(g => g.value < 2.5).length },
  ];

  // Группировка оценок по датам для графика динамики
  // Вычисляем средний балл на каждый день за последний месяц (накопительный средний)
  const gradesWithDates = grades.filter(g => g.date).sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateA - dateB;
  });

  // Определяем период: последние 30 дней от самой поздней оценки или от сегодня
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let periodStart: Date;
  if (gradesWithDates.length > 0) {
    const lastGradeDate = new Date(gradesWithDates[gradesWithDates.length - 1].date!);
    lastGradeDate.setHours(0, 0, 0, 0);
    periodStart = new Date(lastGradeDate);
    periodStart.setDate(periodStart.getDate() - 30);
  } else {
    periodStart = new Date(today);
    periodStart.setDate(periodStart.getDate() - 30);
  }

  // Генерируем массив дней за период
  const daysInPeriod: Date[] = [];
  const currentDate = new Date(periodStart);
  while (currentDate <= today) {
    daysInPeriod.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Вычисляем накопительный средний балл для каждого дня
  const gradesTimeline = daysInPeriod.map(day => {
    // Находим все оценки до этого дня включительно
    const dayStr = day.toISOString().split('T')[0];
    const dayTime = day.getTime();
    
    const gradesUpToDay = gradesWithDates.filter(grade => {
      if (!grade.date) return false;
      const gradeDate = new Date(grade.date);
      gradeDate.setHours(0, 0, 0, 0);
      return gradeDate.getTime() <= dayTime;
    });

    // Вычисляем средний балл
    const average = gradesUpToDay.length > 0
      ? Math.round((gradesUpToDay.reduce((sum, g) => sum + g.value, 0) / gradesUpToDay.length) * 100) / 100
      : 0;

    return {
      date: day.toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' }),
      average: average,
      originalDate: dayStr,
      totalGrades: gradesUpToDay.length
    };
  }).filter(item => item.totalGrades > 0); // Показываем только дни, когда уже были оценки

  const averageGrade = grades.length > 0
    ? Math.round((grades.reduce((sum, g) => sum + g.value, 0) / grades.length) * 100) / 100
    : 0;

  return (
    <div className="container mx-auto px-4 py-8">
      <Link to={groupFilter ? `/group/${generateGroupHash(groupFilter)}` : "/"} className="text-white/80 hover:text-white mb-4 inline-block">
        ← Назад
      </Link>

      <div className="mb-8">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">{course.name}</h1>
            <p className="text-white/80">
              {course.code && `${course.code} • `}
              {course.semester && ` Семестр ${course.semester}`}
            </p>
            {groupFilter && (
              <div className="mt-2 flex items-center gap-3">
                <p className="text-white/60 text-sm">
                  Фильтр: Группа {groupFilter}
                </p>
                <Link
                  to={`/group/${generateGroupHash(groupFilter)}`}
                  className="text-blue-400 text-sm hover:text-blue-300 hover:underline transition-colors"
                >
                  Перейти к статистике группы →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Статистика курса */}
      {user?.role === 'student' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
            <h3 className="text-lg font-bold text-white mb-2">Мой средний балл</h3>
            <div className="text-4xl font-bold text-yellow-400">
              {formatGrade(averageGrade)}
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
            <h3 className="text-lg font-bold text-white mb-2">Всего оценок</h3>
            <div className="text-4xl font-bold text-blue-400">{grades.length}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
            <h3 className="text-lg font-bold text-white mb-2">Посещаемость</h3>
            <div className="text-4xl font-bold text-green-400">
              {courseStats.attendance_rate?.toFixed(1) || '0'}%
            </div>
          </div>
        </div>
      )}

      {/* ИИ-совет по курсу (только для студентов) */}
      {user?.role === 'student' && user.student_id && id && (
        <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 backdrop-blur-lg rounded-xl p-6 border border-blue-500/30 shadow-lg mb-8">
          <div className="flex items-start gap-4">
            <div className="text-3xl flex-shrink-0">🤖</div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-bold text-white">Совет по предмету</h2>
                <button
                  onClick={async () => {
                    if (!user.student_id || !id) return;
                    setLoadingAdvice(true);
                    try {
                      const response = await api.getAIStudentCourseAdvice(user.student_id, parseInt(id));
                      setAiAdvice(response.advice);
                    } catch (error) {
                      console.error('Error loading AI advice:', error);
                      setAiAdvice(null);
                    } finally {
                      setLoadingAdvice(false);
                    }
                  }}
                  disabled={loadingAdvice}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors text-sm flex items-center gap-2"
                >
                  {loadingAdvice ? (
                    <>
                      <div className="animate-spin">⏳</div>
                      <span>Генерация...</span>
                    </>
                  ) : (
                    <>
                      <span>✨</span>
                      <span>Сгенерировать совет</span>
                    </>
                  )}
                </button>
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
                  <p className="text-white/60 text-xs mt-4 pt-3 border-t border-white/10">
                    💡 Совет анализирует ваши оценки по этому предмету и дает конкретные рекомендации для улучшения
                  </p>
                </div>
              ) : (
                <p className="text-white/60 text-sm">
                  Нажмите кнопку "Сгенерировать совет", чтобы получить персональные рекомендации по этому предмету на основе ваших оценок.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Общая статистика курса */}
      {user?.role !== 'student' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
              <h3 className="text-lg font-bold text-white mb-2">Средний балл</h3>
              <div className="text-4xl font-bold text-yellow-400">
                {formatGrade(courseStats.average_grade)}
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
              <h3 className="text-lg font-bold text-white mb-2">Студентов</h3>
              <div className="text-4xl font-bold text-blue-400">
                {courseStats.total_students}
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
              <h3 className="text-lg font-bold text-white mb-2">Посещаемость</h3>
              <div className="text-4xl font-bold text-green-400">
                {courseStats.attendance_rate?.toFixed(1) || '0'}%
              </div>
            </div>
          </div>

          {/* Преподаватели курса */}
          {user?.role === 'admin' && courseStats.teachers && courseStats.teachers.length > 0 && (
            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 mb-8">
              <h2 className="text-xl font-bold text-white mb-4">Преподаватели</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {courseStats.teachers.map((teacher: any) => (
                  <Link
                    key={teacher.id}
                    to={`/teacher/${teacher.id}`}
                    className="bg-white/5 rounded-lg p-4 border border-white/10 hover:bg-white/10 transition-colors"
                  >
                    <div className="text-white font-medium">{teacher.name}</div>
                    <div className="text-white/60 text-sm">{teacher.email}</div>
                    {teacher.department && (
                      <div className="text-white/60 text-sm">Кафедра: {teacher.department}</div>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Статистика по группам и преподавателям (только для админа) */}
          {user?.role === 'admin' && courseStats.teachers_with_groups && courseStats.teachers_with_groups.length > 0 && (
            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 mb-8">
              <h2 className="text-xl font-bold text-white mb-6">Статистика по группам и преподавателям</h2>
              <div className="space-y-6">
                {courseStats.teachers_with_groups.map((teacherData: any, teacherIndex: number) => (
                  <div key={teacherData.teacher.id} className="border-b border-white/10 last:border-b-0 pb-6 last:pb-0">
                    <div className="mb-4">
                      <Link
                        to={`/teacher/${teacherData.teacher.id}`}
                        className="text-xl font-bold text-white hover:text-yellow-400 transition-colors inline-block"
                      >
                        {teacherData.teacher.name}
                      </Link>
                      {teacherData.teacher.department && (
                        <div className="text-white/60 text-sm mt-1">Кафедра: {teacherData.teacher.department}</div>
                      )}
                    </div>
                    
                    {teacherData.groups && teacherData.groups.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {teacherData.groups.map((groupData: any) => (
                          <Link
                            key={groupData.group}
                            to={`/group/${generateGroupHash(groupData.group)}`}
                            className="bg-white/5 rounded-lg p-4 border border-white/10 hover:bg-white/10 transition-colors"
                          >
                            <div className="text-white font-medium mb-2">Группа {groupData.group}</div>
                            <div className="space-y-1 text-sm">
                              <div className="flex justify-between">
                                <span className="text-white/60">Студентов:</span>
                                <span className="text-blue-400 font-medium">{groupData.total_students}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-white/60">Средний балл:</span>
                                <span className="text-yellow-400 font-medium">{formatGrade(groupData.average_grade)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-white/60">Посещаемость:</span>
                                <span className="text-green-400 font-medium">{groupData.attendance_rate?.toFixed(1) || '0'}%</span>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Графики */}
      {user?.role === 'student' && grades.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Распределение оценок */}
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
            <h2 className="text-xl font-bold text-white mb-4">Распределение оценок</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={gradeDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                <XAxis dataKey="grade" stroke="#ffffff80" />
                <YAxis stroke="#ffffff80" />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                <Bar dataKey="count" fill="#60a5fa" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Динамика оценок */}
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
            <h2 className="text-xl font-bold text-white mb-4">Динамика оценок</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={gradesTimeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                <XAxis dataKey="date" stroke="#ffffff80" />
                <YAxis stroke="#ffffff80" domain={[0, 5]} />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                <Line
                  type="monotone"
                  dataKey="average"
                  stroke="#10b981"
                  strokeWidth={2}
                  name="Средний балл"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Календарь оценок */}
      {user?.role === 'student' && (
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-8 border border-white/20 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl font-bold text-white">Календарь оценок</h2>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const newStart = new Date(currentWeekStart);
                  newStart.setDate(newStart.getDate() - 7);
                  setCurrentWeekStart(newStart);
                }}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white font-medium transition-colors"
              >
                ← Предыдущая неделя
              </button>
              <button
                onClick={() => {
                  const today = new Date();
                  const day = today.getDay();
                  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
                  const monday = new Date(today.setDate(diff));
                  monday.setHours(0, 0, 0, 0);
                  setCurrentWeekStart(monday);
                }}
                className="px-4 py-2 bg-blue-500/30 hover:bg-blue-500/40 rounded-lg text-white font-medium transition-colors border border-blue-500/50"
              >
                Текущая неделя
              </button>
              <button
                onClick={() => {
                  const newStart = new Date(currentWeekStart);
                  newStart.setDate(newStart.getDate() + 7);
                  setCurrentWeekStart(newStart);
                }}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white font-medium transition-colors"
              >
                Следующая неделя →
              </button>
            </div>
          </div>
          
          {grades.length === 0 ? (
            <p className="text-white/60 text-center py-12 text-lg">Оценок пока нет</p>
          ) : (
            <GradesCalendar 
              grades={grades} 
              weekStart={currentWeekStart}
              formatGrade={formatGrade}
            />
          )}
        </div>
      )}
    </div>
  );
};

// Компонент календаря оценок
const GradesCalendar: React.FC<{
  grades: Grade[];
  weekStart: Date;
  formatGrade: (grade: number) => string;
}> = ({ grades, weekStart, formatGrade }) => {
  // Группируем оценки по датам
  const gradesByDate = grades.reduce((acc: { [key: string]: Grade[] }, grade) => {
    if (grade.date) {
      const dateKey = grade.date.split('T')[0]; // YYYY-MM-DD
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(grade);
    }
    return acc;
  }, {});

  // Генерируем дни недели (понедельник - воскресенье)
  const weekDays: Date[] = [];
  const dayNames = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  const dayNamesShort = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 
                      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    weekDays.push(date);
  }

  const getGradeColor = (value: number) => {
    if (value >= 4.5) return 'bg-green-500/40 border-green-500/70 text-green-200';
    if (value >= 3.5) return 'bg-blue-500/40 border-blue-500/70 text-blue-200';
    if (value >= 2.5) return 'bg-yellow-500/40 border-yellow-500/70 text-yellow-200';
    return 'bg-red-500/40 border-red-500/70 text-red-200';
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isPast = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    return checkDate < today;
  };

  // Получаем информацию о текущей неделе
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekInfo = `${weekStart.getDate()} ${monthNames[weekStart.getMonth()]} - ${weekEnd.getDate()} ${monthNames[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;

  return (
    <div>
      {/* Информация о текущей неделе */}
      <div className="text-center text-white/80 text-lg font-semibold mb-6">
        Неделя: {weekInfo}
      </div>
      
      {/* Календарь */}
      <div className="grid grid-cols-7 gap-4">
        {weekDays.map((date, index) => {
          const dateKey = date.toISOString().split('T')[0];
          const dayGrades = gradesByDate[dateKey] || [];
          const today = isToday(date);
          const past = isPast(date);
          
          return (
            <div 
              key={index} 
              className={`flex flex-col rounded-xl p-4 min-h-[200px] transition-all ${
                today 
                  ? 'bg-blue-500/30 border-2 border-blue-500/70 shadow-lg shadow-blue-500/20' 
                  : past
                  ? 'bg-white/5 border border-white/10'
                  : 'bg-white/10 border border-white/20 hover:bg-white/15'
              }`}
            >
              {/* Заголовок дня */}
              <div className="mb-3 pb-2 border-b border-white/10">
                <div className={`text-xs font-medium mb-1 ${
                  today ? 'text-blue-300' : 'text-white/50'
                }`}>
                  {dayNamesShort[index]}
              </div>
                <div className={`text-xl font-bold ${
                  today ? 'text-blue-200' : 
                  past ? 'text-white/40' : 'text-white'
              }`}>
                {date.getDate()}
              </div>
                <div className={`text-xs mt-1 ${
                  today ? 'text-blue-300' : 'text-white/50'
              }`}>
                {monthNames[date.getMonth()]}
                </div>
              </div>
              
              {/* Оценки за день */}
              <div className="flex-1 space-y-2">
                {dayGrades.length > 0 ? (
                  <>
                    {dayGrades.map((grade, gradeIndex) => (
                    <div
                      key={grade.id || gradeIndex}
                        className={`${getGradeColor(grade.value)} rounded-lg p-3 text-lg font-bold border-2 text-center cursor-pointer hover:scale-105 transition-transform shadow-md`}
                      title={`${grade.type || 'Оценка'}: ${formatGrade(grade.value)}${grade.type ? `\nТип: ${grade.type}` : ''}`}
                    >
                        <div className="text-2xl mb-1">{formatGrade(grade.value)}</div>
                        {grade.type && (
                          <div className="text-xs opacity-80 font-normal">
                            {grade.type}
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="text-xs text-white/40 text-center mt-2">
                      Всего: {dayGrades.length}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-white/20 text-sm py-8">
                    Нет оценок
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CoursePage;

