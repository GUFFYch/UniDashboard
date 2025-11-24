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

  // Группировка студентов по группам (после сортировки)
  const studentsByGroup: { [key: string]: Student[] } = {};
  sortedStudents.forEach(student => {
    const group = student.group || 'Без группы';
    if (!studentsByGroup[group]) {
      studentsByGroup[group] = [];
    }
    studentsByGroup[group].push(student);
  });

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

  // При первой загрузке разворачиваем все группы
  useEffect(() => {
    const groupKeys = Object.keys(studentsByGroup);
    if (groupKeys.length > 0 && expandedGroups.size === 0) {
      setExpandedGroups(new Set(groupKeys));
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

      {/* Список студентов, сгруппированных по группам */}
      {Object.keys(studentsByGroup).length === 0 ? (
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 text-center">
          <p className="text-white/60 text-lg">Студентов не найдено</p>
        </div>
      ) : (
        Object.entries(studentsByGroup).map(([group, groupStudents]) => {
          const isExpanded = expandedGroups.has(group);
          return (
            <div
              key={group}
              className="mb-6 bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 overflow-hidden transition-all"
            >
              {/* Заголовок группы - кликабельный для сворачивания */}
              <div
                className="p-6 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => toggleGroup(group)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                      <span className="text-white/60 text-xl">▶</span>
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white">
                        Группа {group}
                      </h2>
                      <p className="text-white/60 text-sm mt-1">
                        {groupStudents.length} {groupStudents.length === 1 ? 'студент' : groupStudents.length < 5 ? 'студента' : 'студентов'}
                      </p>
                      {groupStats[group] && (
                        <div className="flex items-center gap-4 mt-2">
                          <div className="flex items-center gap-2">
                            <span className="text-white/60 text-sm">Средний балл:</span>
                            <span className="text-yellow-400 font-bold">{formatGrade(groupStats[group].average_gpa)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-white/60 text-sm">Посещаемость:</span>
                            <span className="text-green-400 font-bold">{groupStats[group].attendance_rate.toFixed(1)}%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link
                      to={`/group/${generateGroupHash(group)}`}
                      onClick={(e) => e.stopPropagation()}
                      className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 rounded-lg text-blue-300 text-sm transition-colors"
                    >
                      Перейти к группе →
                    </Link>
                  </div>
                </div>
              </div>
              
              {/* Содержимое группы - показывается только если развернута */}
              {isExpanded && (
                <div className="px-6 pb-6 pt-2 border-t border-white/10">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                    {groupStudents.map((student) => (
                      <div
                        key={student.id}
                        className="bg-white/5 backdrop-blur-lg rounded-lg p-4 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all"
                      >
                        <Link to={`/student/${student.hash_id}`} className="block">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="text-white font-medium mb-1 flex items-center gap-2">
                                {student.name}
                                {student.is_headman && (
                                  <span className="bg-yellow-500/20 text-yellow-300 text-xs px-2 py-1 rounded">
                                    Староста
                                  </span>
                                )}
                              </div>
                              <div className="text-white/60 text-sm mb-1">{student.group}</div>
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
                          </div>
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};

export default AdminStudentsPage;

