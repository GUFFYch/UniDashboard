import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, DashboardStats, Student, Course } from '../services/api';
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
  ResponsiveContainer,
} from 'recharts';

const AdminView: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [activityData, setActivityData] = useState<any[]>([]);
  const [studentsWithStats, setStudentsWithStats] = useState<{ [key: number]: { gpa: number; attendance_rate: number; present_today?: boolean } }>({});
  const [loading, setLoading] = useState(true);
  const [aiQuery, setAiQuery] = useState<string>('');
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [showStudentsList, setShowStudentsList] = useState(false);
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsData, studentsData, coursesData, activityData, studentsStatsData] = await Promise.all([
        api.getDashboardStats(),
        api.getStudents(),
        api.getCourses(),
        api.getActivityTimeline(30),
        api.getStudentsBulkStats(),
      ]);

      setStats(statsData);
      setStudents(studentsData);
      setCourses(coursesData);
      setActivityData([]); // LMS активность убрана
      setStudentsWithStats(studentsStatsData);
      setLoading(false);
    } catch (error) {
      console.error('Error loading data:', error);
      setLoading(false);
    }
  };

  const loadAIAdvice = async () => {
    setLoadingAdvice(true);
    try {
      const response = await api.getAIAdminAdvice(aiQuery);
      setAiAdvice(response.advice);
    } catch (error) {
      console.error('Error loading AI advice:', error);
      setAiAdvice(null);
    } finally {
      setLoadingAdvice(false);
    }
  };

  const toggleDepartment = (department: string) => {
    setExpandedDepartments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(department)) {
        newSet.delete(department);
      } else {
        newSet.add(department);
      }
      return newSet;
    });
  };

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

  // Функция для определения кафедры по названию группы
  const getDepartmentFromGroup = (groupName: string): string => {
    if (!groupName || groupName === 'Без группы') {
      return 'Без кафедры';
    }
    // Извлекаем кафедру из названия группы (например, "ИТ-1" -> "ИТ", "ПИ-2" -> "ПИ")
    const match = groupName.match(/^([А-ЯЁ]+)/);
    return match ? match[1] : 'Другое';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white text-xl">Загрузка...</div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }


  // Группировка студентов по кафедрам -> группам
  const studentsByDepartmentAndGroup: { [department: string]: { [group: string]: Student[] } } = {};
  students.forEach(student => {
    const group = student.group || 'Без группы';
    const department = getDepartmentFromGroup(group);
    
    if (!studentsByDepartmentAndGroup[department]) {
      studentsByDepartmentAndGroup[department] = {};
    }
    if (!studentsByDepartmentAndGroup[department][group]) {
      studentsByDepartmentAndGroup[department][group] = [];
    }
    studentsByDepartmentAndGroup[department][group].push(student);
  });

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
        <h1 className="text-4xl font-bold text-white mb-2">Панель администрации</h1>
        <p className="text-white/80">Общая картина по кафедре</p>
      </div>

      {/* Общая статистика */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Link to="/admin/students" className="block">
          <StatCard title="Студентов" value={stats.total_students} icon="" color="bg-blue-500" />
        </Link>
        <Link to="/admin/courses" className="block">
          <StatCard title="Курсов" value={stats.total_courses} icon="" color="bg-purple-500" />
        </Link>
        <Link to="/admin/teachers" className="block">
          <StatCard title="Преподавателей" value={stats.total_teachers} icon="" color="bg-teal-500" />
        </Link>
      </div>

      {/* Дополнительные действия */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Link to="/achievements/manage" className="block">
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 hover:bg-white/15 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white mb-1">Управление достижениями</h3>
                <p className="text-white/60 text-sm">Создание и выдача достижений</p>
              </div>
              <div className="text-3xl">→</div>
            </div>
          </div>
        </Link>
        <Link to="/admin/logs" className="block">
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 hover:bg-white/15 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white mb-1">📋 Логи системы</h3>
                <p className="text-white/60 text-sm">Просмотр логов входов и активности</p>
              </div>
              <div className="text-3xl">→</div>
            </div>
          </div>
        </Link>
      </div>

      {/* Ключевые метрики */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h3 className="text-lg font-bold text-white mb-2">Активных сегодня</h3>
          <div className="text-4xl font-bold text-green-400">{stats.active_students_today}</div>
        </div>
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h3 className="text-lg font-bold text-white mb-2">Средний GPA</h3>
          <div className="text-4xl font-bold text-yellow-400">{formatGrade(stats.average_gpa)}</div>
        </div>
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h3 className="text-lg font-bold text-white mb-2">Посещаемость</h3>
          <div className={`text-4xl font-bold ${getAttendanceColor(stats.attendance_rate)}`}>
            {stats.attendance_rate.toFixed(1)}%
          </div>
        </div>
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h3 className="text-lg font-bold text-white mb-2">Динамика</h3>
          <div className="text-4xl font-bold text-blue-400">+5%</div>
          <p className="text-white/60 text-sm mt-1">за месяц</p>
        </div>
      </div>


      {/* Список студентов, сгруппированных по группам */}
      <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Список студентов</h2>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowStudentsList(!showStudentsList)}
              className="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
            >
              {showStudentsList ? '▼ Скрыть' : '▶ Показать'}
            </button>
            <Link
              to="/admin/students"
              className="text-blue-400 hover:text-blue-300 text-sm"
            >
              Все студенты →
            </Link>
          </div>
        </div>
        {showStudentsList && (
          <>
            {Object.keys(studentsByDepartmentAndGroup)
              .sort()
              .map((department) => {
                const isDepartmentExpanded = expandedDepartments.has(department);
                const groupsInDepartment = studentsByDepartmentAndGroup[department];
                const totalStudentsInDepartment = Object.values(groupsInDepartment).reduce(
                  (sum, students) => sum + students.length,
                  0
                );

                return (
                  <div key={department} className="mb-4 border-b border-white/10 last:border-b-0 pb-4 last:pb-0">
                    {/* Плашка кафедры */}
                    <button
                      onClick={() => toggleDepartment(department)}
                      className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-lg hover:from-blue-500/30 hover:to-purple-500/30 transition-colors text-left mb-3 border border-blue-500/30"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{isDepartmentExpanded ? '▼' : '▶'}</span>
                        <div>
                          <h3 className="text-lg font-bold text-white">
                            Кафедра {department}
                          </h3>
                          <p className="text-white/60 text-sm">
                            {Object.keys(groupsInDepartment).length} групп, {totalStudentsInDepartment} студентов
                          </p>
                        </div>
                      </div>
                    </button>

                    {/* Группы внутри кафедры */}
                    {isDepartmentExpanded && (
                      <div className="ml-6 space-y-3">
                        {Object.keys(groupsInDepartment)
                          .sort()
                          .map((group) => {
                            const isGroupExpanded = expandedGroups.has(group);
                            const studentsInGroup = groupsInDepartment[group];

                            return (
                              <div key={group} className="border-l-2 border-white/10 pl-4">
                                {/* Плашка группы */}
                                <button
                                  onClick={() => toggleGroup(group)}
                                  className="w-full flex items-center justify-between p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors text-left mb-2"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg">{isGroupExpanded ? '▼' : '▶'}</span>
                                    <h4 className="text-base font-semibold text-white">
                                      Группа {group}
                                    </h4>
                                    <span className="text-white/60 text-sm">
                                      ({studentsInGroup.length} {studentsInGroup.length === 1 ? 'студент' : studentsInGroup.length < 5 ? 'студента' : 'студентов'})
                                    </span>
                                  </div>
                                </button>

                                {/* Студенты внутри группы */}
                                {isGroupExpanded && (
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-3 ml-6">
                                    {studentsInGroup.map((student) => (
                                      <Link
                                        key={student.id}
                                        to={`/student/${student.hash_id}`}
                                        className="bg-white/5 rounded-lg p-4 hover:bg-white/10 transition-colors flex items-start justify-between"
                                      >
                                        <div className="flex-1">
                                          <div className="text-white font-medium">{student.name}</div>
                                          <div className="text-white/60 text-sm">{student.group}</div>
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
                          })}
                      </div>
                    )}
                  </div>
                );
              })}
          </>
        )}
      </div>

      {/* Список курсов */}
      <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Курсы</h2>
          <Link
            to="/admin/courses"
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            Все курсы →
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((course) => (
            <Link
              key={course.id}
              to={`/course/${course.id}`}
              className="bg-white/5 rounded-lg p-4 border border-white/10 hover:bg-white/10 transition-colors"
            >
              <div className="text-white font-medium">{course.name}</div>
              <div className="text-white/60 text-sm">{course.code}</div>
              
            </Link>
          ))}
        </div>
      </div>

      {/* ИИ-ассистент администратора */}
      <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 backdrop-blur-lg rounded-xl p-6 border border-purple-500/30 shadow-lg">
        <div className="flex items-start gap-4">
          <div className="text-3xl flex-shrink-0">🤖</div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">ИИ-ассистент администратора</h2>
            </div>
            
            <div className="mb-4">
              <p className="text-white/80 text-sm mb-3">
                Задайте вопрос на естественном языке для поиска проблемных зон в системе. Например:
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  onClick={() => setAiQuery('Покажи студентов с низкой успеваемостью')}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white/80 hover:text-white text-xs transition-colors"
                >
                  Студенты с низкой успеваемостью
                </button>
                <button
                  onClick={() => setAiQuery('Покажи группы с низкой посещаемостью')}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white/80 hover:text-white text-xs transition-colors"
                >
                  Группы с низкой посещаемостью
                </button>
                <button
                  onClick={() => setAiQuery('Покажи преподавателей с проблемами')}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white/80 hover:text-white text-xs transition-colors"
                >
                  Проблемные преподаватели
                </button>
                <button
                  onClick={() => setAiQuery('Дай общий анализ проблемных зон')}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white/80 hover:text-white text-xs transition-colors"
                >
                  Общий анализ
                </button>
              </div>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !loadingAdvice) {
                      loadAIAdvice();
                    }
                  }}
                  placeholder="Введите ваш вопрос или запрос..."
                  className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  onClick={loadAIAdvice}
                  disabled={loadingAdvice}
                  className="px-6 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loadingAdvice ? (
                    <>
                      <div className="animate-spin">⏳</div>
                      <span>Поиск...</span>
                    </>
                  ) : (
                    <>
                      <span>🔍</span>
                      <span>Найти</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {loadingAdvice ? (
              <div className="text-white/60 flex items-center gap-2">
                <div className="animate-spin">⏳</div>
                <span>Анализ данных и генерация ответа...</span>
              </div>
            ) : aiAdvice ? (
              <div className="markdown-content text-white/90 leading-relaxed bg-white/5 rounded-lg p-4 border border-white/10">
                <ReactMarkdown
                  components={{
                    p: ({ node, ...props }) => <p className="mb-3" {...props} />,
                    strong: ({ node, ...props }) => <strong className="font-bold text-white" {...props} />,
                    ul: ({ node, ...props }) => <ul className="list-disc list-inside mb-3 space-y-1" {...props} />,
                    ol: ({ node, ...props }) => <ol className="list-decimal list-inside mb-3 space-y-1" {...props} />,
                    li: ({ node, ...props }) => <li className="ml-4" {...props} />,
                    h1: ({ node, ...props }) => <h1 className="text-white text-xl font-bold mb-3 mt-4" {...props} />,
                    h2: ({ node, ...props }) => <h2 className="text-white text-lg font-bold mb-2 mt-3" {...props} />,
                    h3: ({ node, ...props }) => <h3 className="text-white text-base font-semibold mb-2 mt-2" {...props} />,
                  }}
                >
                  {aiAdvice}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="text-white/60 text-sm">
                <p>Введите вопрос или выберите один из примеров выше для начала анализа.</p>
                <p className="mt-2 text-xs text-white/50">
                  ИИ-ассистент может найти студентов, группы и преподавателей с низкой успеваемостью или посещаемостью.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{
  title: string;
  value: string | number;
  icon: string;
  color: string;
}> = ({ title, value, icon, color }) => {
  return (
    <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 hover:bg-white/15 transition-colors cursor-pointer">
      <div className="flex items-center justify-between">
        <div className="flex-1">
        <p className="text-white/60 text-sm mb-2">{title}</p>
        <p className="text-3xl font-bold text-white">{value}</p>
        </div>
        {icon && (
          <div className={`${color} rounded-lg p-3 text-white text-2xl`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminView;
