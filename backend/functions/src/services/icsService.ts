import type { ScheduledStudySession } from '../../../../shared/types/scheduling';

/**
 * Service for generating ICS calendar files
 */
export class ICSService {
  /**
   * Generate ICS calendar content from scheduled study sessions
   */
  generateICS(sessions: ScheduledStudySession[], userId: string): string {
    const calendarHeader = this.generateCalendarHeader();
    const events = sessions.map(session => this.generateEvent(session)).join('\n');
    const calendarFooter = 'END:VCALENDAR';

    return `${calendarHeader}\n${events}\n${calendarFooter}`;
  }

  /**
   * Generate calendar header
   */
  private generateCalendarHeader(): string {
    const now = new Date();
    const timestamp = this.formatICSDate(now);
    
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Output Calendar//Study Schedule Generator//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `DTSTAMP:${timestamp}`,
      'X-WR-CALNAME:Study Schedule',
      'X-WR-CALDESC:Generated study schedule from Output Calendar',
      'X-WR-TIMEZONE:UTC'
    ].join('\n');
  }

  /**
   * Generate a single calendar event
   */
  private generateEvent(session: ScheduledStudySession): string {
    const uid = session.id;
    const summary = this.escapeText(session.title);
    const description = session.notes ? this.escapeText(session.notes) : '';
    const location = session.location || '';
    const categories = session.activityId ? this.escapeText(session.activityId) : '';
    
    const startTime = this.formatICSDate(session.startTime);
    const endTime = this.formatICSDate(session.endTime);
    const timestamp = this.formatICSDate(new Date());
    const lastModified = this.formatICSDate(session.startTime); // Use session start as last modified

    const eventLines = [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `SUMMARY:${summary}`,
      `DTSTART:${startTime}`,
      `DTEND:${endTime}`,
      `DTSTAMP:${timestamp}`,
      `LAST-MODIFIED:${lastModified}`,
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE'
    ];

    if (description) {
      eventLines.push(`DESCRIPTION:${description}`);
    }

    if (location) {
      eventLines.push(`LOCATION:${location}`);
    }

    if (categories) {
      eventLines.push(`CATEGORIES:${categories}`);
    }

    // Add sequence number for updates
    eventLines.push('SEQUENCE:0');

    eventLines.push('END:VEVENT');

    return eventLines.join('\n');
  }

  /**
   * Format date for ICS format (UTC)
   */
  private formatICSDate(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');

    return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
  }

  /**
   * Escape text for ICS format
   */
  private escapeText(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '');
  }

  /**
   * Generate subscription URL for external calendar applications
   */
  generateSubscriptionUrl(userId: string, baseUrl: string): string {
    return `${baseUrl}/calendar/${userId}`;
  }

  /**
   * Generate calendar file name
   */
  generateFileName(userId: string): string {
    const date = new Date().toISOString().split('T')[0];
    return `study-schedule-${userId}-${date}.ics`;
  }
}