import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

interface LoginLog {
  id: number;
  user_id: number;
  user_email: string | null;
  login_time: string;
  logout_time: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

interface ActivityLog {
  id: number;
  user_id: number | null;
  user_email: string | null;
  action_type: string;
  table_name: string;
  record_id: number;
  old_values: string | null;
  new_values: string | null;
  timestamp: string;
}

const LogsPage: React.FC = () => {
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activeTab, setActiveTab] = useState<'login' | 'activity'>('login');
  const [loading, setLoading] = useState(true);
  const [filterTable, setFilterTable] = useState<string>('');

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      if (activeTab === 'login') {
        const logs = await api.getLoginLogs(200);
        setLoginLogs(logs);
      } else {
        const logs = await api.getActivityLogs(200, filterTable || undefined);
        setActivityLogs(logs);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error loading logs:', error);
      setLoading(false);
    }
  }, [activeTab, filterTable]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getActionColor = (actionType: string) => {
    switch (actionType.toLowerCase()) {
      case 'create':
        return 'text-green-400';
      case 'update':
        return 'text-yellow-400';
      case 'delete':
        return 'text-red-400';
      default:
        return 'text-white';
    }
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
        <h1 className="text-4xl font-bold text-white mb-2">📋 Логи системы</h1>
        <p className="text-white/80">Просмотр логов входов и активности</p>
      </div>

      {/* Вкладки */}
      <div className="flex gap-4 mb-6 border-b border-white/20">
        <button
          onClick={() => setActiveTab('login')}
          className={`px-4 py-2 font-semibold transition-colors ${
            activeTab === 'login'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-white/60 hover:text-white'
          }`}
        >
          Логи входов
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={`px-4 py-2 font-semibold transition-colors ${
            activeTab === 'activity'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-white/60 hover:text-white'
          }`}
        >
          Логи активности
        </button>
      </div>

      {/* Фильтр для логов активности */}
      {activeTab === 'activity' && (
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-4 border border-white/20 mb-6">
          <label className="block text-white mb-2">Фильтр по таблице:</label>
          <select
            value={filterTable}
            onChange={(e) => setFilterTable(e.target.value)}
            className="w-full bg-white/10 backdrop-blur-lg border border-white/20 rounded-lg px-4 py-2 text-white"
          >
            <option value="">Все таблицы</option>
            <option value="students">students</option>
            <option value="courses">courses</option>
            <option value="teachers">teachers</option>
            <option value="grades">grades</option>
            <option value="achievements">achievements</option>
            <option value="attendance">attendance</option>
          </select>
        </div>
      )}

      {/* Логи входов */}
      {activeTab === 'login' && (
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h2 className="text-xl font-bold text-white mb-4">Логи входов в систему</h2>
          {loginLogs.length === 0 ? (
            <p className="text-white/60">Логов входов нет</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/20">
                    <th className="text-white/80 pb-3">Пользователь</th>
                    <th className="text-white/80 pb-3">Вход</th>
                    <th className="text-white/80 pb-3">Выход</th>
                    <th className="text-white/80 pb-3">IP адрес</th>
                  </tr>
                </thead>
                <tbody>
                  {loginLogs.map((log) => (
                    <tr key={log.id} className="border-b border-white/10">
                      <td className="text-white py-3">{log.user_email || `ID: ${log.user_id}`}</td>
                      <td className="text-white/80 py-3">{formatDate(log.login_time)}</td>
                      <td className="text-white/80 py-3">
                        {log.logout_time ? formatDate(log.logout_time) : '—'}
                      </td>
                      <td className="text-white/60 py-3 text-sm">{log.ip_address || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Логи активности */}
      {activeTab === 'activity' && (
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h2 className="text-xl font-bold text-white mb-4">Логи активности</h2>
          {activityLogs.length === 0 ? (
            <p className="text-white/60">Логов активности нет</p>
          ) : (
            <div className="space-y-4">
              {activityLogs.map((log) => (
                <div
                  key={log.id}
                  className="bg-white/5 rounded-lg p-4 border border-white/10"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className={`font-semibold ${getActionColor(log.action_type)}`}>
                        {log.action_type.toUpperCase()}
                      </span>
                      <span className="text-white/60 ml-2">
                        {log.table_name} (ID: {log.record_id})
                      </span>
                    </div>
                    <div className="text-white/60 text-sm">
                      {formatDate(log.timestamp)}
                    </div>
                  </div>
                  <div className="text-white/80 text-sm mb-1">
                    Пользователь: {log.user_email || 'Система'}
                  </div>
                  {log.new_values && (
                    <div className="text-white/60 text-xs mt-2 bg-white/5 p-2 rounded">
                      <strong>Новые значения:</strong> {log.new_values.substring(0, 200)}
                      {log.new_values.length > 200 && '...'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LogsPage;

