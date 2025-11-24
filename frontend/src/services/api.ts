import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 секунд таймаут для запросов
});

// Логирование запросов в development режиме
if (process.env.NODE_ENV === 'development') {
  apiClient.interceptors.request.use(
    (config) => {
      console.log('API Request:', config.method?.toUpperCase(), config.url);
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );
}

// Функция для установки токена
export const setAuthToken = (token: string | null) => {
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common['Authorization'];
  }
};

// Восстанавливаем токен из localStorage при инициализации
const savedToken = localStorage.getItem('token');
if (savedToken) {
  setAuthToken(savedToken);
}

// Interceptor для обработки ошибок авторизации
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.error('401 Unauthorized - Token may be invalid or expired');
      // Очищаем токен при 401
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setAuthToken(null);
    }
    return Promise.reject(error);
  }
);

export interface DashboardStats {
  total_students: number;
  total_courses: number;
  total_teachers: number;
  average_gpa: number;
  attendance_rate: number;
  active_students_today: number;
}

export interface User {
  id: number;
  email: string;
  role: 'student' | 'teacher' | 'admin';
  student_id?: number;
  teacher_id?: number;
}

export interface Student {
  id: number;
  name: string;
  email: string;
  group?: string;
  year?: number;
  is_headman?: boolean;
  hash_id?: string;
}

export interface StudentStats {
  student: Student;
  gpa: number;
  total_grades: number;
  attendance_rate: number;
  achievements_count: number;
  burnout_risk?: number;
  success_probability?: number;
  predicted_gpa?: number;
  rank?: number;
  total_students?: number;
}

export interface Grade {
  id: number;
  student_id: number;
  course_id: number;
  value: number;
  type?: string;
  date?: string;
  course_name?: string;
}

export interface Course {
  id: number;
  name: string;
  code?: string;
  credits?: number;
  semester?: number;
}

export interface Teacher {
  id: number;
  name: string;
  email: string;
  department?: string;
}

export interface AttendanceRecord {
  id: number;
  student_id: number;
  course_id?: number;
  date: string;
  present: boolean;
  building?: string;
  entry_time?: string;
  exit_time?: string;
  course_name?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export const api = {
  setToken: (token: string | null) => {
    setAuthToken(token);
  },

  login: async (email: string, password: string): Promise<TokenResponse> => {
    const params = new URLSearchParams();
    params.append('username', email);
    params.append('password', password);
    
    const response = await apiClient.post('/api/auth/login', params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return response.data;
  },

  register: async (
    email: string,
    password: string,
    role: string,
    studentId?: number,
    teacherId?: number
  ): Promise<User> => {
    const response = await apiClient.post('/api/auth/register', {
      email,
      password,
      role,
      student_id: studentId,
      teacher_id: teacherId,
    });
    return response.data;
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get('/api/auth/me');
    return response.data;
  },

  generateData: async () => {
    const response = await apiClient.post('/api/generate-data');
    return response.data;
  },

  getDashboardStats: async (groups?: string, department?: string): Promise<DashboardStats> => {
    const params: any = {};
    if (groups) params.groups = groups;
    if (department) params.department = department;
    const response = await apiClient.get('/api/dashboard/stats', { params });
    return response.data;
  },

  getStudents: async (group?: string): Promise<Student[]> => {
    const params = group ? { group } : {};
    const response = await apiClient.get('/api/students', { params });
    return response.data;
  },

  getMyStudentStats: async (): Promise<StudentStats> => {
    const response = await apiClient.get('/api/students/me');
    return response.data;
  },

  getStudentByHash: async (hashId: string): Promise<StudentStats> => {
    const response = await apiClient.get(`/api/students/by-hash/${hashId}`);
    return response.data;
  },

  getStudentGrades: async (studentId: number, courseId?: number): Promise<Grade[]> => {
    const params = courseId ? { course_id: courseId } : {};
    const response = await apiClient.get(`/api/students/${studentId}/grades`, { params });
    return response.data;
  },

  getCourses: async (): Promise<Course[]> => {
    const response = await apiClient.get('/api/courses');
    return response.data;
  },

  getTeachers: async () => {
    const response = await apiClient.get('/api/teachers');
    return response.data;
  },

  getTeacherStats: async (teacherId: number) => {
    const response = await apiClient.get(`/api/teachers/${teacherId}/stats`);
    return response.data;
  },

  getGroupStats: async (groupName: string) => {
    const response = await apiClient.get(`/api/groups/${encodeURIComponent(groupName)}/stats`);
    return response.data;
  },

  getGroupsBulkStats: async () => {
    const response = await apiClient.get('/api/groups/bulk-stats');
    return response.data;
  },

  getStudentsBulkStats: async () => {
    const response = await apiClient.get('/api/students/bulk-stats');
    return response.data;
  },

  getCourseStats: async (courseId: number, group?: string) => {
    const params = group ? { group } : {};
    const response = await apiClient.get(`/api/courses/${courseId}/stats`, { params });
    return response.data;
  },

  getActivityTimeline: async (days: number = 30, groups?: string, department?: string) => {
    const params: any = { days };
    if (groups) params.groups = groups;
    if (department) params.department = department;
    const response = await apiClient.get('/api/activity/timeline', { params });
    return response.data;
  },

  getLeaderboard: async (limit: number = 10, group?: string, department?: string) => {
    const params: any = { limit };
    if (group) params.group = group;
    if (department) params.department = department;
    const response = await apiClient.get('/api/leaderboard', { params });
    return response.data;
  },

  getStudentAchievements: async (studentId: number) => {
    const response = await apiClient.get(`/api/achievements/${studentId}`);
    return response.data;
  },

  getStudentAttendance: async (
    studentId: number,
    startDate?: string,
    endDate?: string,
    courseId?: number
  ) => {
    const params: any = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    if (courseId) params.course_id = courseId;
    const response = await apiClient.get(`/api/attendance/${studentId}`, { params });
    return response.data;
  },

  getStudentAttendanceByHash: async (
    hashId: string,
    startDate?: string,
    endDate?: string,
    courseId?: number
  ) => {
    const params: any = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    if (courseId) params.course_id = courseId;
    const response = await apiClient.get(`/api/attendance/by-hash/${hashId}`, { params });
    return response.data;
  },

  getAllAchievements: async (courseId?: number, includeDeleted?: boolean) => {
    const params: any = {};
    if (courseId) params.course_id = courseId;
    if (includeDeleted) params.include_deleted = includeDeleted;
    const response = await apiClient.get('/api/achievements', { params });
    return response.data;
  },

  deleteAchievement: async (achievementId: number, permanent: boolean = false) => {
    const response = await apiClient.delete(`/api/achievements/${achievementId}`, {
      params: { permanent }
    });
    return response.data;
  },

  restoreAchievement: async (achievementId: number) => {
    const response = await apiClient.post(`/api/achievements/${achievementId}/restore`);
    return response.data;
  },

  getAchievementStudents: async (achievementId: number) => {
    const response = await apiClient.get(`/api/achievements/${achievementId}/students`);
    return response.data;
  },

  removeAchievementFromStudent: async (achievementId: number, studentId: number) => {
    const response = await apiClient.delete(`/api/achievements/${achievementId}/students/${studentId}`);
    return response.data;
  },

  createAchievement: async (data: {
    name: string;
    description?: string;
    icon?: string;
    points: number;
    course_id?: number | null;
    is_public?: boolean;
  }) => {
    const response = await apiClient.post('/api/achievements', data);
    return response.data;
  },

  assignAchievement: async (data: {
    achievement_id: number;
    student_ids?: number[];
    group?: string;
    department?: string;
    course_id?: number | null;
    all_students?: boolean;
  }) => {
    const response = await apiClient.post('/api/achievements/assign', data);
    return response.data;
  },

  getLoginLogs: async (limit: number = 100) => {
    const response = await apiClient.get('/api/logs/login', { params: { limit } });
    return response.data;
  },

  getActivityLogs: async (limit: number = 100, tableName?: string) => {
    const params: any = { limit };
    if (tableName) params.table_name = tableName;
    const response = await apiClient.get('/api/logs/activity', { params });
    return response.data;
  },

  setHeadman: async (studentId: number, isHeadman: boolean = true) => {
    const response = await apiClient.put(`/api/students/${studentId}/headman`, {
      is_headman: isHeadman
    });
    return response.data;
  },

  getAIStudentAdvice: async (adviceType: string = 'pleasant') => {
    const response = await apiClient.get('/api/ai/advice/student', {
      params: { advice_type: adviceType }
    });
    return response.data;
  },

  getAIStudentAdviceById: async (studentId: number, adviceType: string = 'pleasant') => {
    const response = await apiClient.get(`/api/ai/advice/student/${studentId}`, {
      params: { advice_type: adviceType }
    });
    return response.data;
  },

  getAITeacherAdvice: async () => {
    const response = await apiClient.get('/api/ai/advice/teacher');
    return response.data;
  },

  getAIStudentCourseAdvice: async (studentId: number, courseId: number) => {
    const response = await apiClient.get(`/api/ai/advice/student/${studentId}/course/${courseId}`);
    return response.data;
  },

  getAIAdminAdvice: async (query: string = '') => {
    const response = await apiClient.post('/api/ai/advice/admin', {
      query
    });
    return response.data;
  },
};
