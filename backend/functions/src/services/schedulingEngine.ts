import type { 
  TodoItem 
} from '../../../../shared/types/tasks';
import type { 
  TimeBlock, 
  BusyTimeList, 
  BusyTimeNode 
} from '../../../../shared/types/activities';
import type { 
  ScheduledStudySession, 
  GeneratedSchedule, 
  AvailableTimeSlot, 
  TaskChunk, 
  PriorityResult, 
  SchedulingConfig
} from '../../../../shared/types/scheduling';
import { DEFAULT_SCHEDULING_CONFIG } from '../../../../shared/types/scheduling';

/**
 * Core scheduling engine that converts user data into optimized study schedules
 */
export class SchedulingEngine {
  private config: SchedulingConfig;

  constructor(config: SchedulingConfig = DEFAULT_SCHEDULING_CONFIG) {
    this.config = config;
  }

  /**
   * Convert TimeBlock[] from backend to BusyTimeList[] format for algorithm processing
   */
  convertTimeBlocksToBusyTimeLists(timeBlocks: TimeBlock[]): BusyTimeList[] {
    // Initialize 7 BusyTimeLists (one for each day of the week)
    const busyTimeLists: BusyTimeList[] = Array.from({ length: 7 }, () => ({
      head: null,
      size: 0
    }));

    // Group time blocks by day and sort by start time
    const timeBlocksByDay: { [day: number]: TimeBlock[] } = {};
    for (const timeBlock of timeBlocks) {
      if (timeBlock.type === 'busy') {
        if (!timeBlocksByDay[timeBlock.day]) {
          timeBlocksByDay[timeBlock.day] = [];
        }
        timeBlocksByDay[timeBlock.day].push(timeBlock);
      }
    }

    // Convert each day's time blocks to a BusyTimeList
    for (let day = 0; day < 7; day++) {
      const dayTimeBlocks = timeBlocksByDay[day] || [];
      dayTimeBlocks.sort((a, b) => a.startTime - b.startTime);

      let current: BusyTimeNode | null = null;
      let head: BusyTimeNode | null = null;
      let size = 0;

      for (const timeBlock of dayTimeBlocks) {
        const node: BusyTimeNode = {
          data: [timeBlock.startTime, timeBlock.endTime],
          next: null
        };

        if (!head) {
          head = node;
          current = node;
        } else {
          current!.next = node;
          current = node;
        }
        size++;
      }

      busyTimeLists[day] = { head, size };
    }

    return busyTimeLists;
  }

  /**
   * Calculate available time slots from BusyTimeList for a specific day
   */
  calculateAvailableTimeSlots(busyTimeList: BusyTimeList, day: number): AvailableTimeSlot[] {
    const availableSlots: AvailableTimeSlot[] = [];
    const sortedBusyTimes: [number, number][] = [];

    // Convert BusyTimeList to array and sort by start time
    let current = busyTimeList.head;
    while (current) {
      sortedBusyTimes.push([...current.data]);
      current = current.next;
    }
    sortedBusyTimes.sort((a, b) => a[0] - b[0]);

    let currentTime = 0; // Start of day (midnight)
    const endOfDay = 1440; // 24 hours in minutes

    for (const [startTime, endTime] of sortedBusyTimes) {
      // Check if there's enough time for a study session before this busy period
      const availableDuration = startTime - currentTime - (this.config.bufferTime * 2);
      if (availableDuration >= this.config.minSessionLength) {
        availableSlots.push({
          start: currentTime + this.config.bufferTime,
          end: startTime - this.config.bufferTime,
          duration: availableDuration,
          day
        });
      }
      currentTime = endTime;
    }

    // Handle time after last busy period
    const finalAvailableDuration = endOfDay - currentTime - this.config.bufferTime;
    if (finalAvailableDuration >= this.config.minSessionLength) {
      availableSlots.push({
        start: currentTime + this.config.bufferTime,
        end: endOfDay - this.config.bufferTime,
        duration: finalAvailableDuration,
        day
      });
    }

    return availableSlots;
  }

  /**
   * Calculate priority score for a task based on due date and estimated hours
   */
  calculatePriority(task: TodoItem): PriorityResult {
    const now = new Date();
    const dueDate = task.dueDate === 'TBD' ? null : new Date(task.dueDate);
    
    if (!dueDate) {
      // No due date - low priority
      return {
        taskId: task.id,
        priority: 0.1,
        urgencyMultiplier: 1,
        basePriority: 0.1,
        daysUntilDue: Infinity,
        averageHoursPerDay: 0
      };
    }

    const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const estimatedHours = task.estimatedHours || 1; // Default to 1 hour if not specified
    const averageHoursPerDay = estimatedHours / Math.max(daysUntilDue, 1);
    const basePriority = averageHoursPerDay;

    // Apply urgency multipliers
    let urgencyMultiplier = 1;
    
    if (daysUntilDue <= 0) {
      // Overdue
      urgencyMultiplier = 100;
    } else if (estimatedHours < 3 && daysUntilDue <= 1) {
      urgencyMultiplier = 10;
    } else if (estimatedHours < 6 && daysUntilDue <= 2) {
      urgencyMultiplier = 8;
    } else if (estimatedHours < 12 && daysUntilDue <= 3) {
      urgencyMultiplier = 6;
    } else if (estimatedHours < 18 && daysUntilDue <= 4) {
      urgencyMultiplier = 4;
    } else if (daysUntilDue <= 5) {
      urgencyMultiplier = 2;
    }

    // Check for impossible deadlines
    if (daysUntilDue <= 0) {
      urgencyMultiplier = 100;
    } else if (estimatedHours > daysUntilDue * 8) { // More than 8 hours per day
      urgencyMultiplier = 50;
    }

    const priority = basePriority * urgencyMultiplier;

    return {
      taskId: task.id,
      priority,
      urgencyMultiplier,
      basePriority,
      daysUntilDue,
      averageHoursPerDay
    };
  }

  /**
   * Break down a task into chunks based on estimated hours
   */
  createTaskChunks(task: TodoItem): TaskChunk[] {
    const estimatedHours = task.estimatedHours || 1;
    const maxChunkHours = this.config.maxSessionLength / 60; // Convert to hours
    const totalChunks = Math.ceil(estimatedHours / maxChunkHours);
    
    const chunks: TaskChunk[] = [];
    let remainingHours = estimatedHours;

    for (let i = 0; i < totalChunks; i++) {
      const chunkHours = Math.min(remainingHours, maxChunkHours);
      remainingHours -= chunkHours;

      chunks.push({
        taskId: task.id,
        title: totalChunks > 1 ? `${task.title} (Part ${i + 1} of ${totalChunks})` : task.title,
        notes: task.notes,
        estimatedHours: chunkHours,
        priority: 0, // Will be calculated later
        dueDate: task.dueDate,
        activityId: task.activityId,
        chunkIndex: i,
        totalChunks
      });
    }

    return chunks;
  }

  /**
   * Generate a complete schedule for a user
   */
  async generateSchedule(
    userId: string,
    tasks: TodoItem[],
    timeBlocks: TimeBlock[],
    weekStartDate: Date
  ): Promise<GeneratedSchedule> {
    // Filter out completed tasks
    const incompleteTasks = tasks.filter(task => !task.completed);
    
    if (incompleteTasks.length === 0) {
      return {
        userId,
        weekStartDate: this.formatDate(weekStartDate),
        sessions: [],
        generatedAt: new Date(),
        version: 1
      };
    }

    // Convert time blocks to busy time lists
    const busyTimeLists = this.convertTimeBlocksToBusyTimeLists(timeBlocks);

    // Calculate available time slots for each day
    const availableSlotsByDay: AvailableTimeSlot[][] = [];
    for (let day = 0; day < 7; day++) {
      availableSlotsByDay[day] = this.calculateAvailableTimeSlots(busyTimeLists[day], day);
    }

    // Calculate priorities and create task chunks
    const taskChunks: TaskChunk[] = [];
    const priorityResults: PriorityResult[] = [];

    for (const task of incompleteTasks) {
      const priorityResult = this.calculatePriority(task);
      priorityResults.push(priorityResult);
      
      const chunks = this.createTaskChunks(task);
      // Assign priority to each chunk
      chunks.forEach(chunk => {
        chunk.priority = priorityResult.priority;
      });
      taskChunks.push(...chunks);
    }

    // Sort chunks by priority (highest first)
    taskChunks.sort((a, b) => b.priority - a.priority);

    // Allocate time slots
    const sessions: ScheduledStudySession[] = [];
    const usedSlots: Set<string> = new Set(); // Track used slots to avoid double-booking

    for (const chunk of taskChunks) {
      const chunkDurationMinutes = Math.ceil(chunk.estimatedHours * 60);
      
      // Find the best available slot
      const bestSlot = this.findBestTimeSlot(
        availableSlotsByDay,
        chunkDurationMinutes,
        chunk.dueDate,
        usedSlots
      );

      if (bestSlot) {
        const session = this.createStudySession(chunk, bestSlot, weekStartDate);
        sessions.push(session);
        
        // Mark this slot as used
        const slotKey = `${bestSlot.day}-${bestSlot.start}-${bestSlot.end}`;
        usedSlots.add(slotKey);
      }
    }

    return {
      userId,
      weekStartDate: this.formatDate(weekStartDate),
      sessions,
      generatedAt: new Date(),
      version: 1
    };
  }

  /**
   * Find the best available time slot for a task chunk
   */
  private findBestTimeSlot(
    availableSlotsByDay: AvailableTimeSlot[][],
    durationMinutes: number,
    dueDate: string,
    usedSlots: Set<string>
  ): AvailableTimeSlot | null {
    // Collect all available slots that fit the duration
    const suitableSlots: AvailableTimeSlot[] = [];
    
    for (let day = 0; day < 7; day++) {
      for (const slot of availableSlotsByDay[day]) {
        const slotKey = `${slot.day}-${slot.start}-${slot.end}`;
        
        if (!usedSlots.has(slotKey) && slot.duration >= durationMinutes) {
          suitableSlots.push(slot);
        }
      }
    }

    if (suitableSlots.length === 0) {
      return null;
    }

    // Sort by preference: earlier in week, earlier in day, longer duration
    suitableSlots.sort((a, b) => {
      // Prefer earlier days
      if (a.day !== b.day) {
        return a.day - b.day;
      }
      // Prefer earlier times
      if (a.start !== b.start) {
        return a.start - b.start;
      }
      // Prefer longer durations
      return b.duration - a.duration;
    });

    return suitableSlots[0];
  }

  /**
   * Create a study session from a task chunk and time slot
   */
  private createStudySession(
    chunk: TaskChunk,
    slot: AvailableTimeSlot,
    weekStartDate: Date
  ): ScheduledStudySession {
    const sessionDate = new Date(weekStartDate);
    sessionDate.setDate(sessionDate.getDate() + slot.day);
    
    const startTime = new Date(sessionDate);
    startTime.setHours(Math.floor(slot.start / 60), slot.start % 60, 0, 0);
    
    const endTime = new Date(sessionDate);
    endTime.setHours(Math.floor((slot.start + Math.ceil(chunk.estimatedHours * 60)) / 60), 
                     (slot.start + Math.ceil(chunk.estimatedHours * 60)) % 60, 0, 0);

    return {
      id: `session-${chunk.taskId}-${chunk.chunkIndex}-${Date.now()}`,
      taskId: chunk.taskId,
      title: chunk.title,
      notes: chunk.notes,
      startTime,
      endTime,
      dayOfWeek: slot.day,
      chunkIndex: chunk.totalChunks > 1 ? chunk.chunkIndex + 1 : undefined,
      calculatedPriority: chunk.priority,
      activityId: chunk.activityId
    };
  }

  /**
   * Format date as YYYY-MM-DD string
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}