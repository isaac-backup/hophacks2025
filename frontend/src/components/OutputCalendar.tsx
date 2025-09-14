import { useState, useEffect } from 'react';
import type { GeneratedSchedule, ScheduledStudySession } from '@shared/types/scheduling';
import type { TodoItem } from '@shared/types/tasks';
import type { Activity } from '@shared/types/activities';
import axios from 'axios';
import './OutputCalendar.css';

interface OutputCalendarProps {
  userId: string;
  todos: TodoItem[];
  activities: Activity[];
  onScheduleGenerated?: (schedule: GeneratedSchedule) => void;
}

interface OutputCalendarState {
  schedule: GeneratedSchedule | null;
  isLoading: boolean;
  error: string | null;
  currentViewDate: Date;
  viewMode: 'weekly' | 'daily';
  subscriptionUrl: string | null;
}

export function OutputCalendar({ 
  userId, 
  todos, 
  activities, 
  onScheduleGenerated 
}: OutputCalendarProps) {
  const [state, setState] = useState<OutputCalendarState>({
    schedule: null,
    isLoading: false,
    error: null,
    currentViewDate: new Date(),
    viewMode: 'weekly',
    subscriptionUrl: null
  });

  // Load existing schedule on component mount
  useEffect(() => {
    loadSchedule();
    loadSubscriptionUrl();
  }, [userId]);

  // Regenerate schedule when todos change
  useEffect(() => {
    if (todos.length > 0) {
      generateSchedule();
    }
  }, [todos]);

  const loadSchedule = async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const response = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/schedule/${userId}`);
      const { success, schedule } = response.data;
      
      if (success && schedule) {
        // Convert ISO strings back to Date objects
        const processedSchedule: GeneratedSchedule = {
          ...schedule,
          generatedAt: new Date(schedule.generatedAt),
          sessions: schedule.sessions.map((session: any) => ({
            ...session,
            startTime: new Date(session.startTime),
            endTime: new Date(session.endTime),
          }))
        };
        
        setState(prev => ({ ...prev, schedule: processedSchedule, isLoading: false }));
        onScheduleGenerated?.(processedSchedule);
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    } catch (error) {
      console.error('Error loading schedule:', error);
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: 'Failed to load schedule' 
      }));
    }
  };

  const loadSubscriptionUrl = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/calendar/${userId}/subscribe`);
      const { success, subscriptionUrl } = response.data;
      
      if (success) {
        setState(prev => ({ ...prev, subscriptionUrl }));
      }
    } catch (error) {
      console.error('Error loading subscription URL:', error);
    }
  };

  const generateSchedule = async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const weekStartDate = getWeekStart(new Date());
      const response = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/api/schedule/${userId}/generate`, {
        weekStartDate: weekStartDate.toISOString().split('T')[0]
      });
      
      const { success, schedule } = response.data;
      
      if (success && schedule) {
        // Convert ISO strings back to Date objects
        const processedSchedule: GeneratedSchedule = {
          ...schedule,
          generatedAt: new Date(schedule.generatedAt),
          sessions: schedule.sessions.map((session: any) => ({
            ...session,
            startTime: new Date(session.startTime),
            endTime: new Date(session.endTime),
          }))
        };
        
        setState(prev => ({ ...prev, schedule: processedSchedule, isLoading: false }));
        onScheduleGenerated?.(processedSchedule);
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    } catch (error) {
      console.error('Error generating schedule:', error);
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: 'Failed to generate schedule' 
      }));
    }
  };

  const exportToCalendar = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/calendar/${userId}`, {
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], { type: 'text/calendar' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `study-schedule-${userId}.ics`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting calendar:', error);
      setState(prev => ({ ...prev, error: 'Failed to export calendar' }));
    }
  };

  const handleViewModeToggle = (mode: 'weekly' | 'daily') => {
    setState(prev => ({ ...prev, viewMode: mode }));
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getActivityColor = (activityId?: string): string => {
    if (!activityId) return '#9e9e9e';
    const activity = activities.find(a => a.id === activityId);
    return activity?.color || '#9e9e9e';
  };

  const groupSessionsByDay = (sessions: ScheduledStudySession[]) => {
    const grouped: { [day: number]: ScheduledStudySession[] } = {};
    
    for (let day = 0; day < 7; day++) {
      grouped[day] = [];
    }
    
    sessions.forEach(session => {
      if (grouped[session.dayOfWeek]) {
        grouped[session.dayOfWeek].push(session);
      }
    });
    
    // Sort sessions within each day by start time
    Object.keys(grouped).forEach(day => {
      grouped[parseInt(day)].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    });
    
    return grouped;
  };

  const getWeekStart = (date: Date): Date => {
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(date.setDate(diff));
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
  };

  const getWeekDays = (startDate: Date): Date[] => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(startDate);
      day.setDate(startDate.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const renderWeeklyView = () => {
    if (!state.schedule) return null;

    const weekStart = getWeekStart(state.currentViewDate);
    const weekDays = getWeekDays(weekStart);
    const sessionsByDay = groupSessionsByDay(state.schedule.sessions);

    return (
      <div className="weekly-view">
        <div className="week-header">
          {weekDays.map((day, index) => (
            <div key={index} className="day-header">
              <div className="day-name">{day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
              <div className="day-date">{day.getDate()}</div>
            </div>
          ))}
        </div>
        <div className="week-grid">
          {weekDays.map((_, dayIndex) => (
            <div key={dayIndex} className="day-column">
              <div className="day-sessions">
                {sessionsByDay[dayIndex]?.map((session) => (
                  <div 
                    key={session.id} 
                    className="session-item"
                    style={{ 
                      backgroundColor: getActivityColor(session.activityId),
                      color: 'white'
                    }}
                  >
                    <div className="session-time">
                      {formatTime(session.startTime)} - {formatTime(session.endTime)}
                    </div>
                    <div className="session-title">{session.title}</div>
                    {session.notes && (
                      <div className="session-notes">{session.notes}</div>
                    )}
                  </div>
                )) || null}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderDailyView = () => {
    if (!state.schedule) return null;

    const daySessions = state.schedule.sessions.filter(session => 
      session.dayOfWeek === state.currentViewDate.getDay()
    ).sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    return (
      <div className="daily-view">
        <div className="day-header">
          <h3>{formatDate(state.currentViewDate)}</h3>
        </div>
        <div className="day-sessions">
          {daySessions.length > 0 ? (
            daySessions.map((session) => (
              <div 
                key={session.id} 
                className="session-item daily"
                style={{ 
                  backgroundColor: getActivityColor(session.activityId),
                  color: 'white'
                }}
              >
                <div className="session-time">
                  {formatTime(session.startTime)} - {formatTime(session.endTime)}
                </div>
                <div className="session-title">{session.title}</div>
                {session.notes && (
                  <div className="session-notes">{session.notes}</div>
                )}
                {session.chunkIndex && (
                  <div className="session-chunk">
                    Part {session.chunkIndex}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="no-sessions">
              No study sessions scheduled for this day
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderEmptyState = () => {
    if (todos.length === 0) {
      return (
        <div className="empty-state">
          <h3>No Tasks Available</h3>
          <p>Add some tasks to generate your study schedule</p>
        </div>
      );
    }

    return (
      <div className="empty-state">
        <h3>No Schedule Generated</h3>
        <p>Click "Generate Schedule" to create your study plan</p>
        <button 
          onClick={generateSchedule}
          className="primary-button"
          disabled={state.isLoading}
        >
          {state.isLoading ? 'Generating...' : 'Generate Schedule'}
        </button>
      </div>
    );
  };

  return (
    <div className="output-calendar">
      <div className="calendar-header">
        <h2>📅 Study Schedule</h2>
        <div className="calendar-controls">
          <div className="view-toggle">
            <button 
              className={state.viewMode === 'weekly' ? 'active' : ''}
              onClick={() => handleViewModeToggle('weekly')}
            >
              Weekly
            </button>
            <button 
              className={state.viewMode === 'daily' ? 'active' : ''}
              onClick={() => handleViewModeToggle('daily')}
            >
              Daily
            </button>
          </div>
          <div className="calendar-actions">
            <button 
              onClick={generateSchedule}
              className="secondary-button"
              disabled={state.isLoading}
            >
              {state.isLoading ? 'Generating...' : 'Regenerate'}
            </button>
            {state.schedule && (
              <button 
                onClick={exportToCalendar}
                className="primary-button"
              >
                Export to Calendar
              </button>
            )}
          </div>
        </div>
      </div>

      {state.error && (
        <div className="error-message">
          {state.error}
        </div>
      )}

      {state.isLoading && (
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Generating your study schedule...</p>
        </div>
      )}

      {!state.isLoading && !state.schedule && renderEmptyState()}

      {!state.isLoading && state.schedule && (
        <>
          {state.viewMode === 'weekly' ? renderWeeklyView() : renderDailyView()}
          
          {state.subscriptionUrl && (
            <div className="subscription-info">
              <h4>📱 Add to External Calendar</h4>
              <p>Subscribe to your schedule in Google Calendar, Apple Calendar, or Outlook:</p>
              <div className="subscription-url">
                <code>{state.subscriptionUrl}</code>
                <button 
                  onClick={() => navigator.clipboard.writeText(state.subscriptionUrl!)}
                  className="copy-button"
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}