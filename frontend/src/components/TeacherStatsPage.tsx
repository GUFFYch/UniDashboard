import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, Course } from '../services/api';
import { formatGrade } from '../utils/rounding';

const TeacherStatsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [teacherStats, setTeacherStats] = useState<any>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadTeacherStats(parseInt(id));
    }
  }, [id]);

  const loadTeacherStats = async (teacherId: number) => {
    try {
      setLoading(true);
      const [statsData, coursesData] = await Promise.all([
        api.getTeacherStats(teacherId),
        api.getCourses(),
      ]);

      setTeacherStats(statsData);
      // Фильтруем курсы преподавателя
      const teacherCourses = coursesData.filter(c => statsData.course_ids.includes(c.id));
      setCourses(teacherCourses);
      setLoading(false);
    } catch (error) {
      console.error('Error loading teacher stats:', error);
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

  if (!teacherStats) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-white text-xl">Преподаватель не найден</div>
        <Link to="/admin/teachers" className="text-white/80 hover:text-white mt-4 inline-block">
          ← Назад к списку преподавателей
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Link to="/admin/teachers" className="text-white/80 hover:text-white mb-4 inline-block">
        ← Назад к списку преподавателей
      </Link>

      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">{teacherStats.teacher.name}</h1>
        <p className="text-white/80">
          {teacherStats.teacher.email}
          {teacherStats.teacher.department && ` • ${teacherStats.teacher.department}`}
        </p>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h3 className="text-lg font-bold text-white mb-2">Курсов</h3>
          <div className="text-4xl font-bold text-blue-400">{teacherStats.total_courses}</div>
        </div>
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h3 className="text-lg font-bold text-white mb-2">Студентов</h3>
          <div className="text-4xl font-bold text-green-400">{teacherStats.total_students}</div>
        </div>
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h3 className="text-lg font-bold text-white mb-2">Средний балл</h3>
          <div className="text-4xl font-bold text-yellow-400">
            {formatGrade(teacherStats.average_grade)}
          </div>
        </div>
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h3 className="text-lg font-bold text-white mb-2">Посещаемость</h3>
          <div className="text-4xl font-bold text-purple-400">
            {teacherStats.attendance_rate.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Группы */}
      {teacherStats.groups && teacherStats.groups.length > 0 && (
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 mb-8">
          <h2 className="text-xl font-bold text-white mb-4">Группы</h2>
          <div className="flex flex-wrap gap-2">
            {teacherStats.groups.map((group: string) => (
              <span
                key={group}
                className="px-3 py-1 bg-blue-500/20 rounded-lg text-blue-300 text-sm"
              >
                {group}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Курсы */}
      <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
        <h2 className="text-xl font-bold text-white mb-4">Курсы</h2>
        {courses.length === 0 ? (
          <p className="text-white/60">Курсов нет</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map((course) => (
              <Link
                key={course.id}
                to={`/course/${course.id}`}
                className="bg-white/5 rounded-lg p-4 border border-white/10 hover:bg-white/10 transition-colors"
              >
                <div className="text-white font-medium">{course.name}</div>
                {course.code && (
                  <div className="text-white/60 text-sm">Код: {course.code}</div>
                )}
                {course.credits && (
                  <div className="text-white/60 text-sm">{course.credits} кредитов</div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherStatsPage;

