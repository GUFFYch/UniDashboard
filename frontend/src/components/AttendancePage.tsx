import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AttendanceCalendar from './AttendanceCalendar';
import { api, Course } from '../services/api';

const AttendancePage: React.FC = () => {
  const { user } = useAuth();
  const { hashId } = useParams<{ hashId?: string }>();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | undefined>(undefined);

  useEffect(() => {
    loadCourses();
  }, []);

  const loadCourses = async () => {
    try {
      // Бэкенд автоматически фильтрует курсы для преподавателей
      // Преподаватели видят только свои курсы через CourseTeacher связь
      const coursesData = await api.getCourses();
      setCourses(coursesData);
    } catch (error) {
      console.error('Error loading courses:', error);
    }
  };

  const studentId = user?.role === 'student' ? user.student_id : undefined;

  return (
    <div className="container mx-auto px-4 py-8">
      <Link to={user?.role === 'student' ? '/' : hashId ? `/student/${hashId}` : '/'} className="text-white/80 hover:text-white mb-4 inline-block">
        ← Назад
      </Link>

      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Календарь посещаемости</h1>
        <p className="text-white/80">Просмотр посещаемости по датам</p>
      </div>

      {/* Фильтр по курсу */}
      <div className="mb-6">
        <label className="block text-white mb-2">Фильтр по курсу (необязательно):</label>
        <select
          value={selectedCourseId || ''}
          onChange={(e) => setSelectedCourseId(e.target.value ? parseInt(e.target.value) : undefined)}
          className="w-full md:w-1/3 bg-white/10 backdrop-blur-lg border border-white/20 rounded-lg px-4 py-2 text-white"
        >
          <option value="">Все курсы</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name} {course.code && `(${course.code})`}
            </option>
          ))}
        </select>
      </div>

      {/* Календарь */}
      {studentId ? (
        <AttendanceCalendar studentId={studentId} courseId={selectedCourseId} />
      ) : hashId ? (
        <AttendanceCalendar hashId={hashId} courseId={selectedCourseId} />
      ) : (
        <div className="text-white">Ошибка: не указан студент</div>
      )}
    </div>
  );
};

export default AttendancePage;

