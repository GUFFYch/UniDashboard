import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, Course } from '../services/api';

const AdminCoursesPage: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [filteredCourses, setFilteredCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadCourses();
  }, []);

  useEffect(() => {
    filterCourses();
  }, [searchQuery, courses]);

  const loadCourses = async () => {
    try {
      setLoading(true);
      const coursesData = await api.getCourses();
      setCourses(coursesData);
      setLoading(false);
    } catch (error) {
      console.error('Error loading courses:', error);
      setLoading(false);
    }
  };

  const filterCourses = () => {
    let filtered = [...courses];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        c =>
          c.name.toLowerCase().includes(query) ||
          c.code?.toLowerCase().includes(query)
      );
    }

    setFilteredCourses(filtered);
  };

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
        <h1 className="text-4xl font-bold text-white mb-2">Курсы</h1>
        <p className="text-white/80">Всего курсов: {filteredCourses.length}</p>
      </div>

      {/* Поиск */}
      <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 mb-8">
        <label className="block text-white mb-2">Поиск:</label>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Название курса, код..."
          className="w-full bg-white/10 backdrop-blur-lg border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/40"
        />
      </div>

      {/* Список курсов */}
      {filteredCourses.length === 0 ? (
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 text-center">
          <p className="text-white/60 text-lg">Курсов не найдено</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCourses.map((course) => (
            <Link
              key={course.id}
              to={`/course/${course.id}`}
              className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 hover:bg-white/20 transition-colors"
            >
              <div className="text-white font-medium text-lg mb-2">{course.name}</div>
              {course.code && (
                <div className="text-white/60 text-sm mb-1">Код: {course.code}</div>
              )}
              {course.credits && (
                <div className="text-white/60 text-sm mb-1">
                  {course.credits} кредитов
                </div>
              )}
              {course.semester && (
                <div className="text-white/60 text-sm">Семестр: {course.semester}</div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminCoursesPage;

