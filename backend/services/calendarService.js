const { getCalendar } = require('../config/googleCalendar');

// 🔥 Safe datetime builder
function buildDateTime(date, time) {
  if (!date) throw new Error("Missing date from AI");

  const safeTime = time || "09:00"; // default fallback
  const dt = new Date(`${date}T${safeTime}:00`);

  if (isNaN(dt.getTime())) {
    throw new Error(`Invalid datetime: ${date} ${safeTime}`);
  }

  return dt;
}

// Create a Google Calendar event
async function createCalendarEvent(eventData, userEmail) {
  const calendar = getCalendar();

  const startDateTime = buildDateTime(eventData.date, eventData.time);

  const endDateTime = eventData.endTime
    ? buildDateTime(eventData.date, eventData.endTime)
    : new Date(startDateTime.getTime() + (eventData.duration || 60) * 60000);

  const reminders = (eventData.reminderMinutes || [30, 60]).map((minutes) => ({
    method: 'popup',
    minutes,
  }));

  const event = {
    summary: eventData.title || "CampusFlow Event",
    description: `${eventData.description || ''}

📱 Created via CampusFlow WhatsApp Bot
🏷 Category: ${eventData.category || 'other'}
⚡ Priority: ${eventData.priority || 'medium'}`,
    start: {
      dateTime: startDateTime.toISOString(),
      timeZone: 'Asia/Kolkata',
    },
    end: {
      dateTime: endDateTime.toISOString(),
      timeZone: 'Asia/Kolkata',
    },
    reminders: {
      useDefault: false,
      overrides: reminders,
    },
    colorId: getPriorityColor(eventData.priority),
    attendees: userEmail ? [{ email: userEmail }] : [],
  };

  const response = await calendar.events.insert({
    calendarId: 'primary',
    resource: event,
    sendNotifications: true,
  });

  console.log(`📅 Google Calendar event created: ${response.data.htmlLink}`);
  return response.data;
}

// List upcoming events
async function listUpcomingEvents(maxResults = 10) {
  const calendar = getCalendar();

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: new Date().toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return response.data.items || [];
}

// Delete an event
async function deleteCalendarEvent(eventId) {
  const calendar = getCalendar();
  await calendar.events.delete({ calendarId: 'primary', eventId });
  console.log(`🗑 Calendar event deleted: ${eventId}`);
}

function getPriorityColor(priority) {
  const colors = { high: '11', medium: '5', low: '2' };
  return colors[priority] || '1';
}

module.exports = {
  createCalendarEvent,
  listUpcomingEvents,
  deleteCalendarEvent,
};