import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, DashboardStats, Student, Course } from '../services/api';
import { formatGrade } from '../utils/rounding';
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


  // Группировка студентов по группам
  const studentsByGroup: { [key: string]: Student[] } = {};
  students.forEach(student => {
    const group = student.group || 'Без группы';
    if (!studentsByGroup[group]) {
      studentsByGroup[group] = [];
    }
    studentsByGroup[group].push(student);
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
          <Link
            to="/admin/students"
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            Все студенты →
          </Link>
        </div>
        {Object.keys(studentsByGroup).map((group) => (
          <div key={group} className="mb-6">
            <h3 className="text-lg font-semibold text-white mb-3 border-b border-white/20 pb-2">
              Группа {group} ({studentsByGroup[group].length} студентов)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {studentsByGroup[group].slice(0, 9).map((student) => (
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
            {studentsByGroup[group].length > 9 && (
              <Link
                to="/admin/students"
                className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block"
              >
                Показать всех ({studentsByGroup[group].length} студентов) →
              </Link>
            )}
          </div>
        ))}
      </div>

      {/* Список курсов */}
      <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
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
              <div className="text-white/60 text-sm">
                {course.credits ? `${course.credits} кредитов` : 'Кредиты не указаны'}
              </div>
            </Link>
          ))}
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
