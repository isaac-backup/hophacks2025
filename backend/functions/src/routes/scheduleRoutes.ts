import express from "express";
import { db } from "../config/firebase";
import { SchedulingEngine } from "../services/schedulingEngine";
import { ICSService } from "../services/icsService";
import type { GeneratedSchedule, ScheduledStudySession } from "../../../../shared/types/scheduling";
import type { TodoItem } from "../../../../shared/types/tasks";
import type { TimeBlock } from "../../../../shared/types/activities";

// eslint-disable-next-line new-cap
const router = express.Router();

const schedulingEngine = new SchedulingEngine();
const icsService = new ICSService();

/**
 * POST /api/schedule/:userId/generate
 * Generate a new schedule for a user
 */
router.post("/:userId/generate", async (req, res) => {
  try {
    const { userId } = req.params;
    const { weekStartDate } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // Parse week start date or use current week
    const startDate = weekStartDate ? new Date(weekStartDate) : getWeekStart(new Date());

    // Fetch user's todos
    const todosSnapshot = await db.collection("todos")
      .where("userId", "==", userId)
      .get();

    const todos: TodoItem[] = todosSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as TodoItem));

    // Fetch user's schedule (time blocks)
    const scheduleDoc = await db.collection("schedules").doc(userId).get();
    const timeBlocks: TimeBlock[] = scheduleDoc.exists 
      ? Object.values(scheduleDoc.data()?.timeBlocks || {})
      : [];

    // Generate schedule
    const generatedSchedule = await schedulingEngine.generateSchedule(
      userId,
      todos,
      timeBlocks,
      startDate
    );

    // Save generated schedule to database
    await db.collection("generatedSchedules").doc(userId).set({
      ...generatedSchedule,
      generatedAt: generatedSchedule.generatedAt.toISOString(),
      sessions: generatedSchedule.sessions.map(session => ({
        ...session,
        startTime: session.startTime.toISOString(),
        endTime: session.endTime.toISOString(),
      }))
    });

    return res.json({
      success: true,
      message: "Schedule generated successfully",
      schedule: generatedSchedule,
    });
  } catch (error) {
    console.error("Error generating schedule:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate schedule",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/schedule/:userId
 * Get the current generated schedule for a user
 */
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const scheduleDoc = await db.collection("generatedSchedules").doc(userId).get();

    if (!scheduleDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "No generated schedule found for user",
      });
    }

    const scheduleData = scheduleDoc.data() as any;
    
    // Convert ISO strings back to Date objects
    const schedule: GeneratedSchedule = {
      ...scheduleData,
      generatedAt: new Date(scheduleData.generatedAt),
      sessions: scheduleData.sessions.map((session: any) => ({
        ...session,
        startTime: new Date(session.startTime),
        endTime: new Date(session.endTime),
      }))
    };

    return res.json({
      success: true,
      message: "Schedule retrieved successfully",
      schedule,
    });
  } catch (error) {
    console.error("Error retrieving schedule:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve schedule",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /calendar/:userId
 * Generate and serve .ics calendar file for user's schedule
 */
router.get("/calendar/:userId", async (req, res): Promise<void> => {
  try {
    const { userId } = req.params;

    if (!userId) {
      res.status(400).json({
        success: false,
        message: "User ID is required",
      });
      return;
    }

    // Get the user's generated schedule
    const scheduleDoc = await db.collection("generatedSchedules").doc(userId).get();

    if (!scheduleDoc.exists) {
      res.status(404).json({
        success: false,
        message: "No generated schedule found for user. Please generate a schedule first.",
      });
      return;
    }

    const scheduleData = scheduleDoc.data() as any;
    
    // Convert ISO strings back to Date objects
    const sessions: ScheduledStudySession[] = scheduleData.sessions.map((session: any) => ({
      ...session,
      startTime: new Date(session.startTime),
      endTime: new Date(session.endTime),
    }));

    // Generate ICS content
    const icsContent = icsService.generateICS(sessions, userId);
    const fileName = icsService.generateFileName(userId);

    // Set headers for file download
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.send(icsContent);
  } catch (error) {
    console.error("Error generating calendar file:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate calendar file",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /calendar/:userId/subscribe
 * Get calendar subscription URL for external calendar applications
 */
router.get("/calendar/:userId/subscribe", async (req, res) => {
  try {
    const { userId } = req.params;
    const baseUrl = req.get('host') ? `https://${req.get('host')}` : 'http://localhost:5001';

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const subscriptionUrl = icsService.generateSubscriptionUrl(userId, baseUrl);

    return res.json({
      success: true,
      message: "Calendar subscription URL generated",
      subscriptionUrl,
      instructions: [
        "Copy the subscription URL below and add it to your calendar application:",
        "",
        "Google Calendar:",
        "1. Go to Google Calendar",
        "2. Click the '+' next to 'Other calendars'",
        "3. Select 'From URL'",
        "4. Paste the subscription URL",
        "",
        "Apple Calendar:",
        "1. Open Calendar app",
        "2. Go to File > New Calendar Subscription",
        "3. Paste the subscription URL",
        "",
        "Outlook:",
        "1. Go to Outlook Calendar",
        "2. Click 'Add calendar' > 'From internet'",
        "3. Paste the subscription URL"
      ]
    });
  } catch (error) {
    console.error("Error generating subscription URL:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate subscription URL",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Helper function to get the start of the week (Monday)
 */
function getWeekStart(date: Date): Date {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  const weekStart = new Date(date.setDate(diff));
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

export default router;