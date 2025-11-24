import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api, Course, Student } from '../services/api';
import { formatGrade } from '../utils/rounding';
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

const TeacherView: React.FC = () => {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [courseStats, setCourseStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<string[]>([]);
  const [groupStats, setGroupStats] = useState<{ [key: string]: { average_gpa: number; attendance_rate: number } }>({});
  const [studentsWithStats, setStudentsWithStats] = useState<{ [key: number]: { gpa: number; attendance_rate: number; present_today?: boolean } }>({});
  const [groupSearchQuery, setGroupSearchQuery] = useState<string>('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);

  const loadCourseStats = useCallback(async (courseId: number) => {
    try {
      const stats = await api.getCourseStats(courseId, selectedGroup || undefined);
      setCourseStats(stats);
    } catch (error) {
      console.error('Error loading course stats:', error);
    }
  }, [selectedGroup]);

  useEffect(() => {
    loadCourses();
  }, []);

  useEffect(() => {
    if (selectedCourse) {
      loadCourseStats(selectedCourse);
    }
  }, [selectedCourse, selectedGroup, loadCourseStats]);

  const loadCourses = async () => {
    try {
      const coursesData = await api.getCourses();
      setCourses(coursesData);
      if (coursesData.length > 0) {
        setSelectedCourse(coursesData[0].id);
      }
      
      // Загружаем студентов для получения групп (только тех, где преподает учитель)
      const studentsData = await api.getStudents();
      setStudents(studentsData);
      // Получаем уникальные группы только из студентов преподавателя
      const uniqueGroups = Array.from(new Set(studentsData.map(s => s.group).filter(Boolean))) as string[];
      setGroups(uniqueGroups);
      
      // Загружаем статистику по группам и студентам
      try {
        const [bulkGroupStats, bulkStudentStats] = await Promise.all([
          api.getGroupsBulkStats(),
          api.getStudentsBulkStats()
        ]);
        setGroupStats(bulkGroupStats);
        setStudentsWithStats(bulkStudentStats);
      } catch (error) {
        console.error('Error loading stats:', error);
      }
      
      setLoading(false);
      
      // ИИ-совет теперь загружается только по кнопке
    } catch (error) {
      console.error('Error loading courses:', error);
      setLoading(false);
    }
  };

  const loadAIAdvice = useCallback(async () => {
    if (user?.role === 'teacher' && user.teacher_id) {
      setLoadingAdvice(true);
      try {
        const response = await api.getAITeacherAdvice();
        setAiAdvice(response.advice);
      } catch (error) {
        console.error('Error loading AI advice:', error);
        setAiAdvice(null);
      } finally {
        setLoadingAdvice(false);
      }
    }
  }, [user]);
  
  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(group)) {
        newSet.delete(group);
      } else {
        newSet.add(group);
      }
      return newSet;
    });
  };
  
  // Фильтрация групп по поисковому запросу
  const filteredGroups = groups.filter(group => 
    group.toLowerCase().includes(groupSearchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white text-xl">Загрузка...</div>
      </div>
    );
  }

  // Фильтруем студентов по группе
  const filteredStudents = selectedGroup
    ? students.filter(s => s.group === selectedGroup)
    : students;

  // Группируем студентов по группам
  const studentsByGroup: { [key: string]: Student[] } = {};
  filteredStudents.forEach(student => {
    const group = student.group || 'Без группы';
    if (!studentsByGroup[group]) {
      studentsByGroup[group] = [];
    }
    studentsByGroup[group].push(student);
  });

  // Моковые данные для визуализации
  const engagementData = [
    { week: 'Неделя 1', active: 85, passive: 15 },
    { week: 'Неделя 2', active: 78, passive: 22 },
    { week: 'Неделя 3', active: 92, passive: 8 },
    { week: 'Неделя 4', active: 88, passive: 12 },
  ];

  const gradeDistribution = [
    { grade: '5', count: courseStats ? Math.round(courseStats.total_students * 0.4) : 0 },
    { grade: '4', count: courseStats ? Math.round(courseStats.total_students * 0.35) : 0 },
    { grade: '3', count: courseStats ? Math.round(courseStats.total_students * 0.2) : 0 },
    { grade: '2', count: courseStats ? Math.round(courseStats.total_students * 0.05) : 0 },
  ];

  // Статистика преподавателя
  // Используем filteredStudents для подсчета групп, если выбрана группа
  const studentsForStats = selectedGroup ? filteredStudents : students;
  const uniqueGroupsSet = new Set(studentsForStats.map(s => s.group).filter(Boolean));
  const teacherStats = {
    coursesCount: courses.length,
    groupsCount: uniqueGroupsSet.size,
  };

  // Функция для определения цвета посещаемости
  const getAttendanceColor = (rate: number): string => {
    if (rate >= 90) return 'text-green-400';
    if (rate >= 70) return 'text-blue-400';
    return 'text-red-400';
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Link to="/" className="text-white/80 hover:text-white mb-4 inline-block">
        ← Назад к дашборду
      </Link>

      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Панель преподавателя</h1>
        <p className="text-white/80">Анализ эффективности преподавания</p>
      </div>

      {/* Статистика преподавателя */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <StatCard title="Курсов" value={teacherStats.coursesCount} icon="" color="bg-blue-500" valueColor="text-blue-400" />
        <StatCard title="Групп" value={teacherStats.groupsCount} icon="" color="bg-green-500" valueColor="text-green-400" />
      </div>

      {/* Управление достижениями */}
      <div className="mb-8">
        <Link
          to="/achievements/manage"
          className="block bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 hover:bg-white/15 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Управление достижениями</h3>
              <p className="text-white/60 text-sm">Создание и выдача достижений по вашим курсам</p>
            </div>
            <div className="text-3xl">→</div>
          </div>
        </Link>
      </div>

      {/* Выбор курса */}
      <div className="mb-6">
        <label className="block text-white mb-2">Выберите курс:</label>
        <select
          value={selectedCourse || ''}
          onChange={(e) => setSelectedCourse(parseInt(e.target.value))}
          className="w-full md:w-auto bg-white/10 backdrop-blur-lg border border-white/20 rounded-lg px-4 py-2 text-white"
        >
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name} ({course.code})
            </option>
          ))}
        </select>
      </div>

      {courseStats && (
        <>
          {/* Статистика курса */}
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
              <div className={`text-4xl font-bold ${getAttendanceColor(courseStats.attendance_rate)}`}>
                {courseStats.attendance_rate.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Графики */}
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

            {/* Вовлеченность студентов */}
            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
              <h2 className="text-xl font-bold text-white mb-4">Вовлеченность студентов</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={engagementData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                  <XAxis dataKey="week" stroke="#ffffff80" />
                  <YAxis stroke="#ffffff80" />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="active"
                    stroke="#10b981"
                    strokeWidth={2}
                    name="Активные"
                  />
                  <Line
                    type="monotone"
                    dataKey="passive"
                    stroke="#ef4444"
                    strokeWidth={2}
                    name="Пассивные"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Список студентов, сгруппированных по группам */}
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">
                Студенты {selectedGroup && `(группа ${selectedGroup})`}
              </h2>
              {!selectedGroup && (
                <div className="flex gap-4">
                  {/* Поиск по группам */}
                  <input
                    type="text"
                    placeholder="Поиск по группам..."
                    value={groupSearchQuery}
                    onChange={(e) => setGroupSearchQuery(e.target.value)}
                    className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 text-sm"
                  />
                  {/* Фильтр по группам */}
                  <select
                    value={selectedGroup}
                    onChange={(e) => setSelectedGroup(e.target.value)}
                    className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white text-sm"
                  >
                    <option value="">Все группы</option>
                    {groups.map((group) => (
                      <option key={group} value={group}>
                        {group}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            
            {(() => {
              const groupsToShow = selectedGroup 
                ? [selectedGroup].filter(g => studentsByGroup[g])
                : filteredGroups.filter(g => studentsByGroup[g]);
              
              if (groupsToShow.length === 0) {
                return (
                  <div className="text-center py-8">
                    <p className="text-white/60">Группы не найдены</p>
                  </div>
                );
              }
              
              return groupsToShow.map((group) => {
                const isExpanded = expandedGroups.has(group);
                const stats = groupStats[group];
                const groupStudents = studentsByGroup[group];
                
                return (
                  <div key={group} className="mb-4 border-b border-white/10 last:border-b-0 pb-4 last:pb-0">
                    {/* Заголовок группы с статистикой */}
                    <button
                      onClick={() => toggleGroup(group)}
                      className="w-full flex items-center justify-between p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors text-left"
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-lg font-semibold text-white">
                          {isExpanded ? '▼' : '▶'} Группа {group}
                        </span>
                        <span className="text-white/60 text-sm">
                          ({groupStudents.length} {groupStudents.length === 1 ? 'студент' : groupStudents.length < 5 ? 'студента' : 'студентов'})
                        </span>
                        {stats && (
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-yellow-400">
                              GPA: {formatGrade(stats.average_gpa)}
                            </span>
                            <span className={`${
                              stats.attendance_rate >= 90 ? 'text-green-400' :
                              stats.attendance_rate >= 70 ? 'text-blue-400' : 'text-red-400'
                            }`}>
                              Посещаемость: {stats.attendance_rate.toFixed(1)}%
                            </span>
                          </div>
                        )}
                      </div>
                    </button>
                    
                    {/* Список студентов (показывается при раскрытии) */}
                    {isExpanded && (
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {groupStudents.map((student) => (
                          <Link
                            key={student.id}
                            to={`/student/${student.hash_id}`}
                            className="p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors flex items-start justify-between"
                          >
                            <div className="flex-1">
                              <div className="text-white font-medium">{student.name}</div>
                              <div className="text-white/60 text-sm">{student.email}</div>
                            </div>
                            {/* Индикатор посещаемости сегодня */}
                            <div className="flex-shrink-0 ml-2">
                              {studentsWithStats[student.id]?.present_today ? (
                                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center" title="Был сегодня в университете">
                                  <span className="text-white text-xs font-bold">✓</span>
                                </div>
                              ) : (
                                <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center" title="Не был сегодня в университете">
                                  <span className="text-white text-xs font-bold">Н</span>
                                </div>
                              )}
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>

          {/* Календарь посещаемости для выбранной группы */}
          {selectedGroup && filteredStudents.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-bold text-white mb-4">Календарь посещаемости группы {selectedGroup}</h2>
              <p className="text-white/60 text-sm mb-4">
                Выберите студента из списка выше, чтобы просмотреть его календарь посещаемости
              </p>
            </div>
          )}
        </>
      )}

      {/* ИИ-совет */}
      {user?.role === 'teacher' && (
        <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 backdrop-blur-lg rounded-xl p-6 border border-blue-500/30 shadow-lg mt-8">
          <div className="flex items-start gap-4">
            <div className="text-3xl flex-shrink-0">🤖</div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-bold text-white">Совет от ИИ</h2>
                <button
                  onClick={() => loadAIAdvice()}
                  disabled={loadingAdvice}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loadingAdvice ? (
                    <>
                      <div className="animate-spin">⏳</div>
                      <span>Генерация...</span>
                    </>
                  ) : aiAdvice ? (
                    <>
                      <span>🔄</span>
                      <span>Обновить совет</span>
                    </>
                  ) : (
                    <>
                      <span>✨</span>
                      <span>Получить совет</span>
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
                <div className="markdown-content text-white/90 leading-relaxed">
                  <ReactMarkdown
                    components={{
                      p: ({ node, ...props }) => <p className="mb-3" {...props} />,
                      strong: ({ node, ...props }) => <strong className="font-bold text-white" {...props} />,
                      ul: ({ node, ...props }) => <ul className="list-disc list-inside mb-3 space-y-1" {...props} />,
                      ol: ({ node, ...props }) => <ol className="list-decimal list-inside mb-3 space-y-1" {...props} />,
                      li: ({ node, ...props }) => <li className="ml-4" {...props} />,
                    }}
                  >
                    {aiAdvice}
                  </ReactMarkdown>
                </div>
              ) : (
                <div>
                  <p className="text-white/60 text-sm mb-3">
                    Нажмите кнопку "Получить совет", чтобы получить персональные рекомендации на основе статистики ваших групп по посещаемости и среднему баллу.
                  </p>
                  <div className="flex gap-2 text-xs text-white/50">
                    <span> Совет анализирует группы с низкой посещаемостью или средним баллом</span>
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

const StatCard: React.FC<{
  title: string;
  value: string | number;
  icon: string;
  color: string;
  valueColor?: string;
}> = ({ title, value, icon, color, valueColor = 'text-white' }) => {
  return (
    <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
      <div className="text-center">
        <p className="text-white/60 text-sm mb-2">{title}</p>
        <p className={`text-3xl font-bold ${valueColor}`}>{value}</p>
      </div>
    </div>
  );
};

export default TeacherView;
