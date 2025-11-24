import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

interface Teacher {
  id: number;
  name: string;
  email: string;
  department?: string;
}

const AdminTeachersPage: React.FC = () => {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [filteredTeachers, setFilteredTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadTeachers();
  }, []);

  useEffect(() => {
    filterTeachers();
  }, [searchQuery, teachers]);

  const loadTeachers = async () => {
    try {
      setLoading(true);
      const teachersData = await api.getTeachers();
      setTeachers(teachersData);
      setLoading(false);
    } catch (error) {
      console.error('Error loading teachers:', error);
      setLoading(false);
    }
  };

  const filterTeachers = () => {
    let filtered = [...teachers];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        t =>
          t.name.toLowerCase().includes(query) ||
          t.email.toLowerCase().includes(query) ||
          t.department?.toLowerCase().includes(query)
      );
    }

    setFilteredTeachers(filtered);
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
        <h1 className="text-4xl font-bold text-white mb-2">Преподаватели</h1>
        <p className="text-white/80">Всего преподавателей: {filteredTeachers.length}</p>
      </div>

      {/* Поиск */}
      <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 mb-8">
        <label className="block text-white mb-2">Поиск:</label>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Имя, email, кафедра..."
          className="w-full bg-white/10 backdrop-blur-lg border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/40"
        />
      </div>

      {/* Список преподавателей */}
      {filteredTeachers.length === 0 ? (
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 text-center">
          <p className="text-white/60 text-lg">Преподавателей не найдено</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTeachers.map((teacher) => (
            <Link
              key={teacher.id}
              to={`/teacher/${teacher.id}`}
              className="block bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 hover:bg-white/20 transition-colors"
            >
              <div className="text-white font-medium text-lg mb-2">{teacher.name}</div>
              <div className="text-white/60 text-sm mb-1">{teacher.email}</div>
              {teacher.department && (
                <div className="text-white/60 text-sm">Кафедра: {teacher.department}</div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminTeachersPage;

