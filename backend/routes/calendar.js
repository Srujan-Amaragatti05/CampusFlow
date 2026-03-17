const express = require('express');
const router = express.Router();
const calendarService = require('../services/calendarService');
const dbService = require('../services/dbService');

// GET /api/calendar/events — list upcoming Google Calendar events
router.get('/events', async (req, res) => {
  try {
    const events = await calendarService.listUpcomingEvents(20);
    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calendar/events — manually create an event
router.post('/events', async (req, res) => {
  try {
    const { phone, ...eventData } = req.body;
    const calEvent = await calendarService.createCalendarEvent(eventData);
    if (phone) await dbService.saveEvent(phone, eventData, calEvent.id);
    res.json({ success: true, event: calEvent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/calendar/events/:id
router.delete('/events/:id', async (req, res) => {
  try {
    await calendarService.deleteCalendarEvent(req.params.id);
    await dbService.updateEventStatus(req.params.id, 'deleted');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
