import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, Student } from '../services/api';
import { generateGroupHash } from '../utils/groupHash';
import { formatGrade } from '../utils/rounding';

const AdminStudentsPage: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [groups, setGroups] = useState<string[]>([]);
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [groupStats, setGroupStats] = useState<{ [key: string]: { average_gpa: number; attendance_rate: number } }>({});
  const [studentsWithStats, setStudentsWithStats] = useState<{ [key: number]: { gpa: number; attendance_rate: number; present_today?: boolean } }>({});
  const [sortBy, setSortBy] = useState<'none' | 'gpa_asc' | 'gpa_desc' | 'attendance_asc' | 'attendance_desc'>('none');

  useEffect(() => {
    loadStudents();
  }, []);

  useEffect(() => {
    filterStudents();
  }, [searchQuery, selectedGroup, selectedDepartment, students, sortBy]);

  const loadStudents = async () => {
    try {
      setLoading(true);
      
      // Загружаем студентов, статистику групп и студентов параллельно
      const [studentsData, groupsStatsData, studentsStatsData] = await Promise.all([
        api.getStudents(),
        api.getGroupsBulkStats(),
        api.getStudentsBulkStats()
      ]);
      
      setStudents(studentsData);
      
      // Получаем уникальные группы
      const uniqueGroups = Array.from(new Set(studentsData.map(s => s.group).filter(Boolean))) as string[];
      setGroups(uniqueGroups);
      
      // Устанавливаем статистику групп из bulk запроса
      setGroupStats(groupsStatsData);
      
      // Устанавливаем статистику студентов из bulk запроса
      setStudentsWithStats(studentsStatsData);
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading students:', error);
      setLoading(false);
    }
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

  const filterStudents = () => {
    let filtered = [...students];

    // Фильтр по поисковому запросу
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        s =>
          s.name.toLowerCase().includes(query) ||
          s.email.toLowerCase().includes(query) ||
          s.group?.toLowerCase().includes(query)
      );
    }

    // Фильтр по группе
    if (selectedGroup) {
      filtered = filtered.filter(s => s.group === selectedGroup);
    }

    // Фильтр по кафедре
    if (selectedDepartment) {
      filtered = filtered.filter(s => {
        if (selectedDepartment === 'ИТ') return s.group?.startsWith('ИТ-');
        if (selectedDepartment === 'ПИ') return s.group?.startsWith('ПИ-');
        return true;
      });
    }

    setFilteredStudents(filtered);
  };

  // Сортировка студентов
  const sortedStudents = [...filteredStudents].sort((a, b) => {
    if (sortBy === 'none') return 0;
    
    const statsA = studentsWithStats[a.id] || { gpa: 0, attendance_rate: 0 };
    const statsB = studentsWithStats[b.id] || { gpa: 0, attendance_rate: 0 };
    
    if (sortBy === 'gpa_asc') {
      return statsA.gpa - statsB.gpa;
    } else if (sortBy === 'gpa_desc') {
      return statsB.gpa - statsA.gpa;
    } else if (sortBy === 'attendance_asc') {
      return statsA.attendance_rate - statsB.attendance_rate;
    } else if (sortBy === 'attendance_desc') {
      return statsB.attendance_rate - statsA.attendance_rate;
    }
    
    return 0;
  });

  // Группировка студентов по кафедрам -> группам (после сортировки)
  // Сначала создаем структуру для ВСЕХ групп из базы данных
  const studentsByDepartmentAndGroup: { [department: string]: { [group: string]: Student[] } } = {};
  
  // Инициализируем все группы из базы данных
  groups.forEach(group => {
    const department = getDepartmentFromGroup(group);
    if (!studentsByDepartmentAndGroup[department]) {
      studentsByDepartmentAndGroup[department] = {};
    }
    if (!studentsByDepartmentAndGroup[department][group]) {
      studentsByDepartmentAndGroup[department][group] = [];
    }
  });
  
  // Добавляем отфильтрованных студентов в соответствующие группы
  sortedStudents.forEach(student => {
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
  
  // Получаем все уникальные кафедры из всех групп
  const allDepartments = Array.from(new Set(groups.map(group => getDepartmentFromGroup(group)))).sort();

  const filteredGroups = selectedDepartment
    ? groups.filter(g => {
        if (selectedDepartment === 'ИТ') return g.startsWith('ИТ-');
        if (selectedDepartment === 'ПИ') return g.startsWith('ПИ-');
        return true;
      })
    : groups;

  // Функция для переключения состояния группы (свернуть/развернуть)
  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupName)) {
        newSet.delete(groupName);
      } else {
        newSet.add(groupName);
      }
      return newSet;
    });
  };

  // При первой загрузке разворачиваем все кафедры
  useEffect(() => {
    const departmentKeys = Object.keys(studentsByDepartmentAndGroup);
    if (departmentKeys.length > 0 && expandedDepartments.size === 0) {
      setExpandedDepartments(new Set(departmentKeys));
    }
  }, [filteredStudents.length]);


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white text-xl">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Link to="/admin" className="text-white/80 hover:text-white mb-4 inline-block">
        ← Назад к панели администрации
      </Link>

      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Поиск студентов</h1>
        <p className="text-white/80">Всего студентов: {filteredStudents.length}</p>
      </div>

      {/* Фильтры */}
      <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-white mb-2">Поиск:</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Имя, email, группа..."
              className="w-full bg-white/10 backdrop-blur-lg border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/40"
            />
          </div>
          <div>
            <label className="block text-white mb-2">Кафедра:</label>
            <select
              value={selectedDepartment}
              onChange={(e) => {
                setSelectedDepartment(e.target.value);
                setSelectedGroup(''); // Сбрасываем группу при смене кафедры
              }}
              className="w-full bg-white/10 backdrop-blur-lg border border-white/20 rounded-lg px-4 py-2 text-white"
            >
              <option value="">Все кафедры</option>
              <option value="ИТ">ИТ</option>
              <option value="ПИ">ПИ</option>
            </select>
          </div>
          <div>
            <label className="block text-white mb-2">Группа:</label>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="w-full bg-white/10 backdrop-blur-lg border border-white/20 rounded-lg px-4 py-2 text-white"
            >
              <option value="">Все группы</option>
              {filteredGroups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </div>
        </div>
        
        {/* Сортировка */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-white mb-2">Сортировка по среднему баллу:</label>
            <select
              value={sortBy.startsWith('gpa') ? sortBy : 'none'}
              onChange={(e) => {
                const value = e.target.value;
                setSortBy(value === 'none' ? 'none' : (value as any));
              }}
              className="w-full bg-white/10 backdrop-blur-lg border border-white/20 rounded-lg px-4 py-2 text-white"
            >
              <option value="none">Без сортировки</option>
              <option value="gpa_desc">По убыванию (от лучших)</option>
              <option value="gpa_asc">По возрастанию (от худших)</option>
            </select>
          </div>
          <div>
            <label className="block text-white mb-2">Сортировка по посещаемости:</label>
            <select
              value={sortBy.startsWith('attendance') ? sortBy : 'none'}
              onChange={(e) => {
                const value = e.target.value;
                setSortBy(value === 'none' ? 'none' : (value as any));
              }}
              className="w-full bg-white/10 backdrop-blur-lg border border-white/20 rounded-lg px-4 py-2 text-white"
            >
              <option value="none">Без сортировки</option>
              <option value="attendance_desc">По убыванию (от лучших)</option>
              <option value="attendance_asc">По возрастанию (от худших)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Список студентов, сгруппированных по кафедрам -> группам */}
      {allDepartments.length === 0 ? (
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 text-center">
          <p className="text-white/60 text-lg">Групп не найдено</p>
        </div>
      ) : (
        <>
          {allDepartments.map((department) => {
              const isDepartmentExpanded = expandedDepartments.has(department);
              const groupsInDepartment = studentsByDepartmentAndGroup[department] || {};
              const totalStudentsInDepartment = Object.values(groupsInDepartment).reduce(
                (sum, students) => sum + students.length,
                0
              );
              
              // Подсчитываем ВСЕ группы этой кафедры из базы данных
              const allGroupsInDepartment = groups.filter(group => getDepartmentFromGroup(group) === department);
              const totalGroupsInDepartment = allGroupsInDepartment.length;

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
                          {totalGroupsInDepartment} групп, {totalStudentsInDepartment} студентов
                        </p>
                      </div>
                    </div>
                  </button>

                  {/* Группы внутри кафедры - показываем ВСЕ группы из базы данных */}
                  {isDepartmentExpanded && (
                    <div className="ml-6 space-y-3">
                      {groups
                        .filter(group => {
                          // Фильтруем группы по кафедре
                          const groupDepartment = getDepartmentFromGroup(group);
                          return groupDepartment === department;
                        })
                        .sort()
                        .map((group) => {
                          const isGroupExpanded = expandedGroups.has(group);
                          const studentsInGroup = groupsInDepartment[group] || [];

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
                                  {groupStats[group] && (
                                    <>
                                      <span className="text-white/40 text-sm mx-2">•</span>
                                      <span className="text-white/60 text-sm">Средний балл:</span>
                                      <span className="text-yellow-400 font-bold text-sm ml-1">{formatGrade(groupStats[group].average_gpa)}</span>
                                      <span className="text-white/40 text-sm mx-2">•</span>
                                      <span className="text-white/60 text-sm">Посещаемость:</span>
                                      <span className="text-green-400 font-bold text-sm ml-1">{groupStats[group].attendance_rate.toFixed(1)}%</span>
                                    </>
                                  )}
                                </div>
                                <Link
                                  to={`/group/${generateGroupHash(group)}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 rounded-lg text-blue-300 text-xs transition-colors"
                                >
                                  Перейти →
                                </Link>
                              </button>

                              {/* Студенты внутри группы */}
                              {isGroupExpanded && (
                                <div className="mt-3 ml-6">
                                  {studentsInGroup.length === 0 ? (
                                    <div className="text-white/60 text-sm py-4">
                                      В этой группе нет студентов, соответствующих фильтрам
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                      {studentsInGroup.map((student) => (
                                        <Link
                                          key={student.id}
                                          to={`/student/${student.hash_id}`}
                                          className="bg-white/5 rounded-lg p-4 hover:bg-white/10 transition-colors flex items-start justify-between"
                                        >
                                          <div className="flex-1">
                                            <div className="text-white font-medium flex items-center gap-2">
                                              {student.name}
                                              {student.is_headman && (
                                                <span className="bg-yellow-500/20 text-yellow-300 text-xs px-1.5 py-0.5 rounded">
                                                  Староста
                                                </span>
                                              )}
                                            </div>
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
  );
};

export default AdminStudentsPage;

