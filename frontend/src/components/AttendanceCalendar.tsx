import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

interface AttendanceRecord {
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

interface AttendanceCalendarProps {
  studentId?: number;
  hashId?: string;
  courseId?: number;
  startDate?: Date;
  endDate?: Date;
}

const AttendanceCalendar: React.FC<AttendanceCalendarProps> = ({
  studentId,
  hashId,
  courseId,
  startDate,
  endDate,
}) => {
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);

  useEffect(() => {
    loadAttendance();
  }, [studentId, hashId, courseId, currentMonth]);

  const loadAttendance = async () => {
    try {
      setLoading(true);
      const start = startDate || new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const end = endDate || new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
      
      let data: AttendanceRecord[];
      if (hashId) {
        data = await api.getStudentAttendanceByHash(
          hashId,
          start.toISOString().split('T')[0],
          end.toISOString().split('T')[0],
          courseId
        );
      } else if (studentId) {
        data = await api.getStudentAttendance(
          studentId,
          start.toISOString().split('T')[0],
          end.toISOString().split('T')[0],
          courseId
        );
      } else {
        data = [];
      }
      
      setAttendance(data);
    } catch (error) {
      console.error('Error loading attendance:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAttendanceForDate = (date: Date): AttendanceRecord[] => {
    const dateStr = date.toISOString().split('T')[0];
    return attendance.filter(a => a.date === dateStr);
  };

  const getDayStatus = (date: Date): 'present' | 'absent' | 'partial' | 'none' => {
    const records = getAttendanceForDate(date);
    if (records.length === 0) return 'none';
    
    const presentCount = records.filter(r => r.present).length;
    const absentCount = records.filter(r => !r.present).length;
    
    if (presentCount > 0 && absentCount === 0) return 'present';
    if (absentCount > 0 && presentCount === 0) return 'absent';
    if (presentCount > 0 && absentCount > 0) return 'partial';
    return 'none';
  };

  const formatTime = (timeStr?: string): string => {
    if (!timeStr) return '';
    try {
      const date = new Date(timeStr);
      return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return timeStr;
    }
  };

  const getDaysInMonth = (date: Date): Date[] => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: Date[] = [];
    
    // Добавляем дни предыдущего месяца для заполнения первой недели
    const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Понедельник = 0
    for (let i = startDay - 1; i >= 0; i--) {
      const prevDate = new Date(year, month, -i);
      days.push(prevDate);
    }
    
    // Добавляем дни текущего месяца
    for (let day = 1; day <= lastDay.getDate(); day++) {
      days.push(new Date(year, month, day));
    }
    
    // Добавляем дни следующего месяца для заполнения последней недели
    const remainingDays = 7 - (days.length % 7);
    if (remainingDays < 7) {
      for (let day = 1; day <= remainingDays; day++) {
        days.push(new Date(year, month + 1, day));
      }
    }
    
    return days;
  };

  const monthNames = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];

  const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const handleDateClick = (date: Date) => {
    const records = getAttendanceForDate(date);
    if (records.length > 0) {
      setSelectedDate(date);
      setSelectedRecord(records[0]); // Показываем первую запись, если их несколько
    }
  };

  const isCurrentMonth = (date: Date): boolean => {
    return date.getMonth() === currentMonth.getMonth() &&
           date.getFullYear() === currentMonth.getFullYear();
  };

  const isToday = (date: Date): boolean => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-white text-xl">Загрузка календаря...</div>
      </div>
    );
  }

  const days = getDaysInMonth(currentMonth);

  return (
    <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Календарь посещаемости</h2>
        <div className="flex items-center gap-4">
          <button
            onClick={prevMonth}
            className="px-4 py-2 bg-white/10 rounded-lg text-white hover:bg-white/20 transition-colors"
          >
            ←
          </button>
          <span className="text-white text-lg font-semibold min-w-[200px] text-center">
            {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </span>
          <button
            onClick={nextMonth}
            className="px-4 py-2 bg-white/10 rounded-lg text-white hover:bg-white/20 transition-colors"
          >
            →
          </button>
        </div>
      </div>

      {/* Легенда */}
      <div className="flex flex-wrap gap-4 mb-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-500 rounded"></div>
          <span className="text-white/80">Присутствовал</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-500 rounded"></div>
          <span className="text-white/80">Отсутствовал</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-yellow-500 rounded"></div>
          <span className="text-white/80">Частично</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-500 rounded"></div>
          <span className="text-white/80">Нет данных</span>
        </div>
      </div>

      {/* Календарь */}
      <div className="grid grid-cols-7 gap-2 mb-4">
        {weekDays.map((day) => (
          <div key={day} className="text-center text-white/60 font-semibold py-2">
            {day}
          </div>
        ))}
        {days.map((date, index) => {
          const status = getDayStatus(date);
          const records = getAttendanceForDate(date);
          const isCurrent = isCurrentMonth(date);
          const isTodayDate = isToday(date);
          
          let bgColor = 'bg-gray-500/30';
          if (isCurrent) {
            if (status === 'present') bgColor = 'bg-green-500';
            else if (status === 'absent') bgColor = 'bg-red-500';
            else if (status === 'partial') bgColor = 'bg-yellow-500';
            else bgColor = 'bg-gray-500/30';
          }
          
          return (
            <div
              key={index}
              onClick={() => handleDateClick(date)}
              className={`
                ${bgColor}
                ${isCurrent ? 'cursor-pointer hover:opacity-80' : 'opacity-50'}
                ${isTodayDate ? 'ring-2 ring-blue-400' : ''}
                rounded-lg p-2 min-h-[60px] flex flex-col items-center justify-center transition-all
              `}
            >
              <span className={`text-sm font-medium ${isCurrent ? 'text-white' : 'text-white/40'}`}>
                {date.getDate()}
              </span>
              {records.length > 0 && isCurrent && (
                <span className="text-xs text-white/80 mt-1">
                  {records.length} {records.length === 1 ? 'запись' : 'записей'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Детали выбранной даты */}
      {selectedDate && selectedRecord && (
        <div className="mt-6 p-4 bg-white/5 rounded-lg border border-white/20">
          <h3 className="text-lg font-bold text-white mb-3">
            {selectedDate.toLocaleDateString('ru-RU', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </h3>
          <div className="space-y-2">
            {getAttendanceForDate(selectedDate).map((record) => (
              <div key={record.id} className="p-3 bg-white/5 rounded">
                <div className="flex items-center justify-between mb-2">
                  <span className={`font-semibold ${record.present ? 'text-green-400' : 'text-red-400'}`}>
                    {record.present ? '✓ Присутствовал' : '✗ Отсутствовал'}
                  </span>
                  {record.course_name && (
                    <span className="text-white/80 text-sm">{record.course_name}</span>
                  )}
                </div>
                {record.building && (
                  <div className="text-white/60 text-sm">Здание: {record.building}</div>
                )}
                {record.entry_time && (
                  <div className="text-white/60 text-sm">Вход: {formatTime(record.entry_time)}</div>
                )}
                {record.exit_time && (
                  <div className="text-white/60 text-sm">Выход: {formatTime(record.exit_time)}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceCalendar;

