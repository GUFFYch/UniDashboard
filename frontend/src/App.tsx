import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import StudentView from './components/StudentView';
import TeacherView from './components/TeacherView';
import AdminView from './components/AdminView';
import AttendancePage from './components/AttendancePage';
import AchievementsPage from './components/AchievementsPage';
import CoursePage from './components/CoursePage';
import AdminStudentsPage from './components/AdminStudentsPage';
import AdminTeachersPage from './components/AdminTeachersPage';
import AdminCoursesPage from './components/AdminCoursesPage';
import TeacherStatsPage from './components/TeacherStatsPage';
import GroupStatsPage from './components/GroupStatsPage';
import AchievementsManagementPage from './components/AchievementsManagementPage';
import LogsPage from './components/LogsPage';

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 via-blue-600 to-indigo-800">
        <div className="text-white text-xl">Загрузка...</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={!user ? <Login /> : <Navigate to="/" replace />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            {user?.role === 'student' ? <StudentView /> : <Dashboard />}
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/:hashId"
        element={
          <ProtectedRoute allowedRoles={['teacher', 'admin']}>
            <StudentView />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher"
        element={
          <ProtectedRoute allowedRoles={['teacher', 'admin']}>
            <TeacherView />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminView />
          </ProtectedRoute>
        }
      />
      <Route
        path="/attendance"
        element={
          <ProtectedRoute>
            <AttendancePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/attendance/:hashId"
        element={
          <ProtectedRoute allowedRoles={['teacher', 'admin']}>
            <AttendancePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/achievements"
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <AchievementsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/course/:id"
        element={
          <ProtectedRoute>
            <CoursePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/students"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminStudentsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/teachers"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminTeachersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/courses"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminCoursesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/:id"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <TeacherStatsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/group/:groupName"
        element={
          <ProtectedRoute allowedRoles={['admin', 'teacher', 'student']}>
            <GroupStatsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/achievements/manage"
        element={
          <ProtectedRoute allowedRoles={['admin', 'teacher']}>
            <AchievementsManagementPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/logs"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <LogsPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen">
          <AppRoutes />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
