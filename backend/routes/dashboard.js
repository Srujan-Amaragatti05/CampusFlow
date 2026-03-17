const express = require('express');
const router = express.Router();
const dbService = require('../services/dbService');
const aiService = require('../services/aiService');
const calendarService = require('../services/calendarService');

// ─────────────────────────────────────────────
// GET /api/dashboard — main dashboard
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    let stats = {};
    let upcomingEvents = [];
    let calendarEvents = [];

    // 🔥 Run independently (no full crash)
    try {
      stats = await dbService.getDashboardStats();
    } catch (err) {
      console.error("❌ Stats error:", err.message);
      stats = { totalActiveEvents: 0, eventsToday: 0, totalUsers: 0 };
    }

    try {
      upcomingEvents = await dbService.getUpcomingEvents(20);
    } catch (err) {
      console.error("❌ Firestore events error:", err.message);

      // Handle index error gracefully
      if (err.code === 9) {
        console.warn("⚠️ Firestore index missing for events query");
      }

      upcomingEvents = [];
    }

    try {
      calendarEvents = await calendarService.listUpcomingEvents(10);
    } catch (err) {
      console.error("❌ Calendar error:", err.message);
      calendarEvents = [];
    }

    res.json({
      success: true,
      stats,
      upcomingEvents,
      calendarEvents: calendarEvents.map((e) => ({
        id: e.id,
        title: e.summary,
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        link: e.htmlLink,
      })),
    });

  } catch (err) {
    console.error("❌ Dashboard fatal error:", err.message);

    res.status(500).json({
      success: false,
      error: "Dashboard failed",
      details: err.message,
    });
  }
});

// ─────────────────────────────────────────────
// GET /api/dashboard/insights
// ─────────────────────────────────────────────
router.get('/insights', async (req, res) => {
  try {
    let upcomingEvents = [];

    try {
      upcomingEvents = await dbService.getUpcomingEvents(30);
    } catch (err) {
      console.error("❌ Insights Firestore error:", err.message);
      upcomingEvents = [];
    }

    let workloadAnalysis = null;
    let studySchedule = null;
    let productivityInsight = null;

    try {
      workloadAnalysis = await aiService.detectWorkloadOverload(upcomingEvents);
    } catch (err) {
      console.error("❌ Workload AI error:", err.message);
      workloadAnalysis = {
        isOverloaded: false,
        riskLevel: 'low',
        message: 'Unable to analyze workload right now',
        suggestions: [],
      };
    }

    try {
      if (upcomingEvents.length > 0) {
        studySchedule = await aiService.generateStudySchedule(
          upcomingEvents.slice(0, 10)
        );
      }
    } catch (err) {
      console.error("❌ Study schedule error:", err.message);
    }

    try {
      productivityInsight = await aiService.generateProductivityInsight(
        0,
        upcomingEvents.length
      );
    } catch (err) {
      console.error("❌ Productivity AI error:", err.message);
      productivityInsight = "Keep going! You're doing great 💪";
    }

    res.json({
      success: true,
      insights: {
        workload: workloadAnalysis,
        studySchedule,
        productivity: productivityInsight,
        totalUpcoming: upcomingEvents.length,
      },
    });

  } catch (err) {
    console.error("❌ Insights fatal error:", err.message);

    res.status(500).json({
      success: false,
      error: "Insights failed",
      details: err.message,
    });
  }
});

// ─────────────────────────────────────────────
// GET /api/dashboard/events/:phone
// ─────────────────────────────────────────────
router.get('/events/:phone', async (req, res) => {
  try {
    const events = await dbService.getEventsByPhone(req.params.phone);

    res.json({
      success: true,
      phone: req.params.phone,
      events,
    });

  } catch (err) {
    console.error("❌ Events fetch error:", err.message);

    res.status(500).json({
      success: false,
      error: "Failed to fetch events",
      details: err.message,
    });
  }
});

module.exports = router;