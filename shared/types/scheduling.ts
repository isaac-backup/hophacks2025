/**
 * Data types for the Output Calendar scheduling system
 */

import type { BusyTimeList } from './activities';

/**
 * Represents a single scheduled study session
 */
export interface ScheduledStudySession {
  id: string;
  taskId: string; // Reference to source TodoItem
  title: string; // e.g., "Study for Chemistry Exam"
  notes?: string; // From TodoItem notes field
  startTime: Date;
  endTime: Date;
  dayOfWeek: number; // 0-6 for Monday-Sunday
  chunkIndex?: number; // For multi-part tasks (1 of 3, 2 of 3, etc.)
  calculatedPriority: number; // Internal priority score used for scheduling
  
  // Future ICS compatibility fields
  location?: string; // Always null for MVP
  activityId?: string; // From source TodoItem
}

/**
 * Represents a complete generated schedule for a user
 */
export interface GeneratedSchedule {
  userId: string;
  weekStartDate: string; // YYYY-MM-DD format
  sessions: ScheduledStudySession[];
  generatedAt: Date;
  version: number; // For handling concurrent updates
}

/**
 * Available time slot for scheduling
 */
export interface AvailableTimeSlot {
  start: number; // minutes from midnight
  end: number; // minutes from midnight
  duration: number; // in minutes
  day: number; // 0-6 for Monday-Sunday
}

/**
 * Task chunk for multi-part scheduling
 */
export interface TaskChunk {
  taskId: string;
  title: string;
  notes?: string;
  estimatedHours: number;
  priority: number;
  dueDate: string;
  activityId?: string;
  chunkIndex: number;
  totalChunks: number;
}

/**
 * ICS Event properties for calendar export
 */
export interface ICSEvent {
  uid: string; // Unique identifier for the event
  summary: string; // Event title (e.g., "Study for Chemistry Exam")
  description?: string; // Event description from TodoItem notes
  location?: string; // Always null for MVP
  dtstart: Date; // Event start time
  dtend: Date; // Event end time
  dtstamp: Date; // Creation/modification timestamp
  categories?: string; // From TodoItem activityId
  status: 'CONFIRMED' | 'CANCELLED';
  lastModified: Date; // Last modification time
}

/**
 * Scheduling algorithm configuration
 */
export interface SchedulingConfig {
  maxSessionLength: number; // Maximum study session length in minutes (default: 60)
  minSessionLength: number; // Minimum study session length in minutes (default: 5)
  bufferTime: number; // Buffer time around busy periods in minutes (default: 5)
  maxStudyHoursPerWeek: number; // Maximum study hours per week (default: 20)
}

/**
 * Default scheduling configuration
 */
export const DEFAULT_SCHEDULING_CONFIG: SchedulingConfig = {
  maxSessionLength: 60,
  minSessionLength: 5,
  bufferTime: 5,
  maxStudyHoursPerWeek: 20,
};

/**
 * Utility type for converting TimeBlock[] to BusyTimeList[]
 */
export interface TimeBlockConverter {
  convertToBusyTimeLists(timeBlocks: import('./activities').TimeBlock[]): BusyTimeList[];
  convertToTimeBlocks(busyTimeLists: BusyTimeList[]): import('./activities').TimeBlock[];
}

/**
 * Priority calculation result
 */
export interface PriorityResult {
  taskId: string;
  priority: number;
  urgencyMultiplier: number;
  basePriority: number;
  daysUntilDue: number;
  averageHoursPerDay: number;
}