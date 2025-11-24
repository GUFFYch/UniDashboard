import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api, DashboardStats, Student } from '../services/api';
import { formatGrade } from '../utils/rounding';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [originalStats, setOriginalStats] = useState<DashboardStats | null>(null); // Статистика без фильтров для карточек
  const [students, setStudents] = useState<Student[]>([]);
  const [activityData, setActivityData] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Фильтры
  const [leaderboardLimit, setLeaderboardLimit] = useState(10);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [allGroups, setAllGroups] = useState<string[]>([]);
  const [groupInput, setGroupInput] = useState<string>('');


  // Фильтруем группы по кафедре
  const filteredGroups = selectedDepartment
    ? allGroups.filter(g => {
        if (selectedDepartment === 'ИТ') return g.startsWith('ИТ-');
        if (selectedDepartment === 'ПИ') return g.startsWith('ПИ-');
        return true;
      })
    : allGroups;

  // Загружаем исходную статистику без фильтров (только один раз при монтировании)
  // Это нужно для карточки "Мои группы", которая не должна меняться при фильтрации
  useEffect(() => {
    let isMounted = true;
    
    if (!originalStats) {
      api.getDashboardStats().then(originalStatsData => {
        if (isMounted) {
          setOriginalStats(originalStatsData);
          // Если stats еще не загружены, используем originalStats как начальные stats
          if (!stats) {
            setStats(originalStatsData);
          }
        }
      }).catch(error => {
        if (isMounted) {
          console.error('Error loading original stats:', error);
        }
      });
    }
    
    return () => {
      isMounted = false;
    };
  }, []); // Загружаем только один раз при монтировании

  const loadData = useCallback(async () => {
    try {
      const groupsParam = selectedGroups.length > 0 ? selectedGroups.join(',') : undefined;
      
      // Загружаем всех студентов для получения полного списка групп (если нет фильтров)
      const allStudentsData = await api.getStudents();
      const uniqueGroups = Array.from(new Set(allStudentsData.map(s => s.group).filter(Boolean))) as string[];
      setAllGroups(uniqueGroups);
      
      // Для получения студентов используем все выбранные группы
      // Если выбрано несколько групп, получаем студентов из всех групп
      let studentsPromise;
      if (selectedGroups.length > 0) {
        // Получаем студентов из всех выбранных групп
        const studentsPromises = selectedGroups.map(group => api.getStudents(group));
        studentsPromise = Promise.all(studentsPromises).then(results => {
          // Объединяем и убираем дубликаты
          const allStudents = results.flat();
          const uniqueStudents = Array.from(
            new Map(allStudents.map(s => [s.id, s])).values()
          );
          return uniqueStudents;
        });
      } else {
        studentsPromise = api.getStudents();
      }

      const [statsData, studentsData, activityData, leaderboardData] = await Promise.all([
        api.getDashboardStats(groupsParam, selectedDepartment || undefined),
        studentsPromise,
        api.getActivityTimeline(30, groupsParam, selectedDepartment || undefined),
        api.getLeaderboard(leaderboardLimit, selectedGroups.length > 0 ? selectedGroups.join(',') : undefined, selectedDepartment || undefined),
      ]);

      setStats(statsData);
      setStudents(studentsData);
      setActivityData([]); // LMS активность убрана
      setLeaderboard(leaderboardData);
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading data:', error);
      setLoading(false);
    }
  }, [leaderboardLimit, selectedGroups, selectedDepartment]);

  // Загружаем данные при изменении фильтров
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Обработка добавления группы
  const handleAddGroup = () => {
    const group = groupInput.trim();
    // Проверяем, что группа существует в allGroups и соответствует фильтру кафедры
    if (group && allGroups.includes(group) && !selectedGroups.includes(group)) {
      // Если выбрана кафедра, проверяем соответствие
      if (selectedDepartment) {
        if (selectedDepartment === 'ИТ' && group.startsWith('ИТ-')) {
          setSelectedGroups([...selectedGroups, group]);
          setGroupInput('');
        } else if (selectedDepartment === 'ПИ' && group.startsWith('ПИ-')) {
          setSelectedGroups([...selectedGroups, group]);
          setGroupInput('');
        } else {
          // Группа не соответствует выбранной кафедре
          return;
        }
      } else {
        // Кафедра не выбрана - можно добавить любую группу
        setSelectedGroups([...selectedGroups, group]);
        setGroupInput('');
      }
    }
  };

  // Удаление группы из выбранных
  const handleRemoveGroup = (groupToRemove: string) => {
    setSelectedGroups(selectedGroups.filter(g => g !== groupToRemove));
  };

  // Очистка выбранных групп при смене кафедры
  useEffect(() => {
    if (selectedDepartment) {
      setSelectedGroups(prev => {
        const filtered = prev.filter(g => {
          if (selectedDepartment === 'ИТ') return g.startsWith('ИТ-');
          if (selectedDepartment === 'ПИ') return g.startsWith('ПИ-');
          return true;
        });
        return filtered;
      });
    }
  }, [selectedDepartment]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white text-xl">Загрузка...</div>
      </div>
    );
  }

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
        <div className="text-white text-xl">Ошибка загрузки данных</div>
      </div>
    );
  }

  // Распределение студентов по успеваемости
  const getDistributionData = () => {
    if (!stats) return [];
    
    // Упрощенная логика - в реальности нужно считать по GPA студентов
    const excellent = Math.round(stats.total_students * 0.2);
    const good = Math.round(stats.total_students * 0.4);
    const average = Math.round(stats.total_students * 0.3);
    const needHelp = stats.total_students - excellent - good - average;
    
    return [
      { name: 'Отличники (4.5+)', value: excellent },
      { name: 'Хорошисты (3.5-4.5)', value: good },
      { name: 'Троечники (3.0-3.5)', value: average },
      { name: 'Нужна помощь (<3.0)', value: needHelp },
    ];
  };

  const pieData = getDistributionData();

  // Определяем заголовок в зависимости от роли
  const getTitle = () => {
    if (user?.role === 'student') return 'Ваша персональная аналитика';
    if (user?.role === 'teacher') return 'Аналитика эффективности преподавания';
    if (user?.role === 'admin') return 'Общая картина по кафедре';
    return 'Дашборд';
  };

  // Функция для определения цвета посещаемости
  const getAttendanceColor = (rate: number): string => {
    if (rate >= 90) return 'text-green-400';
    if (rate >= 70) return 'text-blue-400';
    return 'text-red-400';
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Навбар */}
      <nav className="bg-white/10 backdrop-blur-lg border-b border-white/20 mb-8 rounded-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center">
              <Link to="/" className="flex items-center space-x-2">
                <span className="text-2xl"></span>
                <span className="text-xl font-bold text-white">MIREA SYNAPSE</span>
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-white/80 text-sm">
                {user?.email} ({user?.role === 'student' ? 'Студент' : user?.role === 'teacher' ? 'Преподаватель' : 'Администратор'})
              </span>
              {user?.role === 'student' && (
                <Link
                  to="/"
                  className="px-4 py-2 bg-white/10 rounded-lg text-white hover:bg-white/20 transition-colors text-sm"
                >
                  Моя страница
                </Link>
              )}
              {user?.role === 'teacher' && (
                <Link
                  to="/teacher"
                  className="px-4 py-2 bg-white/10 rounded-lg text-white hover:bg-white/20 transition-colors text-sm"
                >
                  Преподаватель
                </Link>
              )}
              {user?.role === 'admin' && (
                <Link
                  to="/admin"
                  className="px-4 py-2 bg-white/10 rounded-lg text-white hover:bg-white/20 transition-colors text-sm"
                >
                  Администрация
                </Link>
              )}
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

      <div className="mb-8">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Пульс кафедры</h1>
          <p className="text-white/80">{getTitle()}</p>
        </div>
      </div>

      {/* Простая сетка дашборда */}
      <div className="w-full max-w-7xl mx-auto grid grid-cols-12 gap-5">
          {/* Статистические карточки для админа */}
          {user?.role === 'admin' && (
            <>
              <div className="col-span-3 bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 shadow-lg hover:shadow-xl transition-shadow">
                <Link to="/admin/students" className="block p-6 hover:bg-white/5 transition-colors rounded-lg">
                  <StatCard
                    title="Студентов"
                    value={stats.total_students}
                    icon=""
                    color="bg-blue-500"
                    valueColor="text-blue-400"
                  />
                </Link>
              </div>
              <div className="col-span-3 bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 shadow-lg hover:shadow-xl transition-shadow">
                <Link to="/admin/courses" className="block p-6 hover:bg-white/5 transition-colors rounded-lg">
                  <StatCard
                    title="Курсов"
                    value={stats.total_courses}
                    icon=""
                    color="bg-purple-500"
                    valueColor="text-purple-400"
                  />
                </Link>
              </div>
              <div className="col-span-3 bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 shadow-lg hover:shadow-xl transition-shadow">
                <Link to="/admin/teachers" className="block p-6 hover:bg-white/5 transition-colors rounded-lg">
                  <StatCard
                    title="Преподавателей"
                    value={stats.total_teachers}
                    icon=""
                    color="bg-teal-500"
                    valueColor="text-teal-400"
                  />
                </Link>
              </div>
              <div className="col-span-3 bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 shadow-lg hover:shadow-xl transition-shadow">
                <Link to="/admin/attendance" className="block p-6 hover:bg-white/5 transition-colors rounded-lg">
                  <StatCard
                    title="Посещений"
                    value={stats.total_students * 30}
                    icon=""
                    color="bg-green-500"
                    valueColor="text-green-400"
                  />
                </Link>
              </div>
            </>
          )}

          {/* Статистические карточки для преподавателя и студента */}
          {(user?.role === 'teacher' || user?.role === 'student') && (
            <>
              <div className="col-span-3 bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 shadow-lg hover:shadow-xl transition-shadow">
                {user?.role === 'teacher' ? (
                  <Link to="/teacher" className="block p-6 hover:bg-white/5 transition-colors rounded-lg">
                    <StatCard
                      title="Мои группы"
                      value={originalStats?.total_students ?? stats?.total_students ?? 0}
                      icon=""
                      color="bg-blue-500"
                      valueColor="text-blue-400"
                    />
                  </Link>
                ) : (
                  <div className="p-6">
                    <StatCard
                      title="Моя группа"
                      value={stats.total_students}
                      icon=""
                      color="bg-blue-500"
                      valueColor="text-blue-400"
                    />
                  </div>
                )}
              </div>
              <div className="col-span-3 bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 shadow-lg hover:shadow-xl transition-shadow">
                {user?.role === 'teacher' ? (
                  <Link to="/teacher" className="block p-6 hover:bg-white/5 transition-colors rounded-lg">
                    <StatCard
                      title="Мои курсы"
                      value={originalStats?.total_courses ?? stats?.total_courses ?? 0}
                      icon=""
                      color="bg-purple-500"
                      valueColor="text-purple-400"
                    />
                  </Link>
                ) : (
                  <div className="p-6">
                    <StatCard
                      title="Курсов"
                      value={stats.total_courses}
                      icon=""
                      color="bg-purple-500"
                      valueColor="text-purple-400"
                    />
                  </div>
                )}
              </div>
              <div className="col-span-3 bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 shadow-lg hover:shadow-xl transition-shadow">
                <div className="p-6">
                  <StatCard
                    title="Средний балл"
                    value={formatGrade(stats.average_gpa)}
                    icon=""
                    color="bg-yellow-500"
                    valueColor="text-yellow-400"
                  />
                </div>
              </div>
              <div className="col-span-3 bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 shadow-lg hover:shadow-xl transition-shadow">
                {user?.role === 'student' ? (
                  <Link to="/attendance" className="block p-6 hover:bg-white/5 transition-colors rounded-lg">
                    <StatCard
                      title="Посещаемость"
                      value={`${stats.attendance_rate.toFixed(1)}%`}
                      icon=""
                      color="bg-green-500"
                      valueColor={getAttendanceColor(stats.attendance_rate)}
                    />
                  </Link>
                ) : (
                  <div className="p-6">
                    <StatCard
                      title="Посещаемость"
                      value={`${stats.attendance_rate.toFixed(1)}%`}
                      icon=""
                      color="bg-green-500"
                      valueColor={getAttendanceColor(stats.attendance_rate)}
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {/* Фильтры для топа студентов */}
          {user?.role === 'admin' && (
            <div className="col-span-12 bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 shadow-lg">
              <div className="p-6">
                <h2 className="text-xl font-bold text-white mb-4">Фильтры</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-white/80 text-sm mb-2">Количество в топе</label>
                    <select
                      value={leaderboardLimit}
                      onChange={(e) => setLeaderboardLimit(Number(e.target.value))}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white"
                    >
                      <option value={10}>Топ 10</option>
                      <option value={20}>Топ 20</option>
                      <option value={50}>Топ 50</option>
                      <option value={100}>Топ 100</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-white/80 text-sm mb-2">Группы (можно выбрать несколько)</label>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={groupInput}
                        onChange={(e) => setGroupInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddGroup()}
                        list="groups-list"
                        placeholder="Введите название группы"
                        className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50"
                      />
                      <button
                        onClick={handleAddGroup}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white"
                      >
                        Добавить
                      </button>
                    </div>
                    <datalist id="groups-list">
                      {filteredGroups.map((group) => (
                        <option key={group} value={group} />
                      ))}
                    </datalist>
                    {selectedGroups.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {selectedGroups.map((group) => (
                          <span
                            key={group}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-blue-500/20 border border-blue-500/50 rounded-lg text-white text-sm"
                          >
                            {group}
                            <button
                              onClick={() => handleRemoveGroup(group)}
                              className="hover:text-red-400"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        <button
                          onClick={() => setSelectedGroups([])}
                          className="text-white/60 hover:text-white text-sm"
                        >
                          Очистить все
                        </button>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-white/80 text-sm mb-2">Кафедра/Направление</label>
                    <select
                      value={selectedDepartment}
                      onChange={(e) => setSelectedDepartment(e.target.value)}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white"
                    >
                      <option value="">Все направления</option>
                      <option value="ИТ">Информационные технологии</option>
                      <option value="ПИ">Программная инженерия</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Распределение студентов */}
          <div className="col-span-6 bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 shadow-lg">
            <div className="p-6 h-full flex flex-col">
              <h2 className="text-xl font-bold text-white mb-4">
                Распределение студентов {selectedGroups.length > 0 && `(${selectedGroups.length} групп)`}
              </h2>
              <div className="flex-1 min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Контейнер для статистики справа */}
          {(user?.role === 'admin' || user?.role === 'student') && (
            <div className="col-span-6 flex flex-col gap-5">
              {/* Дополнительная статистика: GPA */}
              <div className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 shadow-lg">
                <div className="p-6">
                  <div className="text-3xl mb-3"></div>
                  <h2 className="text-xl font-bold text-white mb-2">Средний балл</h2>
                  <div className="text-5xl font-bold text-yellow-400 mb-2">{formatGrade(stats.average_gpa)}</div>
                  <p className="text-white/60 text-sm">
                    {selectedGroups.length > 0 
                      ? `По выбранным группам: ${selectedGroups.join(', ')}`
                      : selectedDepartment
                      ? `По кафедре: ${selectedDepartment}`
                      : 'По всем студентам'}
                  </p>
                </div>
              </div>

              {/* Дополнительная статистика: Посещаемость */}
              <div className="bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 shadow-lg">
                <div className="p-6">
                  <div className="text-3xl mb-3"></div>
                  <h2 className="text-xl font-bold text-white mb-2">Посещаемость</h2>
                  <p className="text-white/60 text-sm mb-4">
                    Процент посещаемости занятий за последние 30 дней.
                  </p>
                  <div className={`text-5xl font-bold mb-2 ${getAttendanceColor(stats.attendance_rate)}`}>
                    {stats.attendance_rate.toFixed(1)}%
                  </div>
                  <p className="text-white/60 text-sm">
                    {selectedGroups.length > 0 
                      ? `По выбранным группам: ${selectedGroups.join(', ')}`
                      : selectedDepartment
                      ? `По кафедре: ${selectedDepartment}`
                      : 'По всем студентам'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Кнопки перехода на страницы поиска (только для админа) */}
          {user?.role === 'admin' && (
            <div className="col-span-12 bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 shadow-lg">
              <div className="p-6">
                <h2 className="text-xl font-bold text-white mb-4">Быстрый переход</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Link
                    to="/admin/students"
                    className="px-6 py-3 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 rounded-lg text-white text-center transition-colors"
                  >
                    Поиск студентов
                  </Link>
                  <Link
                    to="/admin/teachers"
                    className="px-6 py-3 bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/50 rounded-lg text-white text-center transition-colors"
                  >
                    Поиск преподавателей
                  </Link>
                  <Link
                    to="/admin/courses"
                    className="px-6 py-3 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/50 rounded-lg text-white text-center transition-colors"
                  >
                    Поиск курсов
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Рейтинг студентов */}
          <div className={`${user?.role === 'admin' ? 'col-span-8' : 'col-span-12'} bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 shadow-lg`}>
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-4">
                Топ студентов {leaderboardLimit > 0 && `(топ ${leaderboardLimit})`}
              </h2>
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                {leaderboard.map((item, index) => (
                  <Link
                    key={item.student_id}
                    to={user?.role === 'student' ? '/' : `/student/${item.hash_id}`}
                    className="flex items-center justify-between p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
                  >
                    <div className="flex items-center space-x-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${
                        index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-orange-500' : 'bg-white/10'
                      }`}>
                        {index + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="text-white font-medium truncate">{item.name}</div>
                        <div className="text-white/60 text-sm truncate">{item.group}</div>
                      </div>
                    </div>
                    <div className="text-white font-bold flex-shrink-0 ml-2">{item.gpa}</div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Быстрый доступ к студентам (только для администратора) */}
          {user?.role === 'admin' && (
            <div className="col-span-4 bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 shadow-lg">
              <div className="p-6">
                <h2 className="text-xl font-bold text-white mb-4">Быстрый доступ</h2>
                <div className="grid grid-cols-2 gap-3 max-h-[600px] overflow-y-auto pr-2">
                  {students.slice(0, 12).map((student) => (
                    <Link
                      key={student.id}
                      to={`/student/${student.hash_id}`}
                      className="p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors text-center flex-shrink-0"
                    >
                      <div className="text-white text-sm font-medium truncate">{student.name}</div>
                      <div className="text-white/60 text-xs truncate">{student.group}</div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  );
};

const StatCard: React.FC<{
  title: string;
  value: string | number;
  icon: string;
  color: string;
  valueColor?: string;
  tooltip?: string;
}> = ({ title, value, icon, color, valueColor = 'text-white', tooltip }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="w-full h-full flex flex-col justify-center">
      <div className="text-center">
        {icon && (
          <div className="text-4xl mb-3">{icon}</div>
        )}
        <div className="flex items-center justify-center space-x-2 mb-3">
          <p className="text-white/80 text-sm font-medium">{title}</p>
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
        <p className={`text-4xl font-bold ${valueColor}`}>{value}</p>
      </div>
    </div>
  );
};

export default Dashboard;
