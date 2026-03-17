const Groq = require('groq-sdk');
const { getDb } = require('../config/firebase');
const { getEventsByPhone, getUpcomingEvents } = require('./dbService');
const whatsappService = require('./whatsappService');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GROQ_MODEL || 'llama3-8b-8192';

// ─────────────────────────────────────────────────────────
// 1. SMART DAILY BRIEF — sent every morning at 8 AM
// ─────────────────────────────────────────────────────────
async function sendDailyBrief(phone) {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const events = await getEventsByPhone(phone, 20);
  const todayEvents = events.filter(e => e.date === today);
  const tomorrowEvents = events.filter(e => e.date === tomorrow);
  const upcomingHigh = events.filter(e => e.priority === 'high' && e.date >= today).slice(0, 3);

  const greeting = getTimeGreeting();
  const motivationalQuote = await getMotivationalQuote();

  let brief = `${greeting} 🌟\n\n`;
  brief += `*📅 Today's Schedule (${formatDate(today)})*\n`;

  if (todayEvents.length === 0) {
    brief += `No events today — a great day to get ahead! 🚀\n`;
  } else {
    todayEvents.forEach(e => {
      brief += `• ${e.time} — *${e.title}* ${getPriorityEmoji(e.priority)}\n`;
    });
  }

  if (tomorrowEvents.length > 0) {
    brief += `\n*📆 Tomorrow:*\n`;
    tomorrowEvents.forEach(e => {
      brief += `• ${e.time} — ${e.title}\n`;
    });
  }

  if (upcomingHigh.length > 0) {
    brief += `\n*🔴 High Priority Upcoming:*\n`;
    upcomingHigh.forEach(e => {
      const daysLeft = Math.ceil((new Date(e.date) - new Date()) / 86400000);
      brief += `• ${e.title} — in *${daysLeft} day${daysLeft !== 1 ? 's' : ''}*\n`;
    });
  }

  brief += `\n💭 _"${motivationalQuote}"_\n\n_— CampusFlow Daily Brief_ 📚`;

  await whatsappService.sendMessage(phone, brief);
}

async function getMotivationalQuote() {
  const quotes = [
    'The secret of getting ahead is getting started.',
    "You don't have to be great to start, but you have to start to be great.",
    'Push yourself, because no one else is going to do it for you.',
    'Great things never come from comfort zones.',
    'Dream it. Believe it. Build it.',
    "Success is the sum of small efforts repeated day in and day out.",
    "Don't watch the clock; do what it does. Keep going.",
    "The harder you work for something, the greater you'll feel when you achieve it.",
  ];
  return quotes[Math.floor(Math.random() * quotes.length)];
}

// ─────────────────────────────────────────────────────────
// 2. PROCRASTINATION DETECTOR
// ─────────────────────────────────────────────────────────
async function detectProcrastination(phone) {
  const db = getDb();
  const snap = await db.collection('events')
    .where('phone', '==', phone)
    .where('status', '==', 'active')
    .get();

  const events = snap.docs.map(d => d.data());
  const today = new Date().toISOString().split('T')[0];

  // Find events that are past due
  const overdue = events.filter(e => e.date < today);

  if (overdue.length === 0) return null;

  const response = await groq.chat.completions.create({
    model: MODEL,
    messages: [{
      role: 'system',
      content: 'You are a caring academic advisor detecting procrastination. Return only JSON: { "message": "...", "urgency": "high|medium", "tips": ["tip1","tip2"] }'
    }, {
      role: 'user',
      content: `Student has ${overdue.length} overdue tasks: ${JSON.stringify(overdue.map(e => e.title))}. Give compassionate, actionable advice.`
    }],
    temperature: 0.6,
    max_tokens: 300,
  });

  try {
    const raw = response.choices[0].message.content.trim();
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? { ...JSON.parse(match[0]), overdueCount: overdue.length, overdueTasks: overdue } : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────
// 3. GROUP STUDY FINDER
// ─────────────────────────────────────────────────────────
async function findGroupStudySlot(phones, date, durationMinutes = 60) {
  const allBusySlots = [];

  for (const phone of phones) {
    const events = await getEventsByPhone(phone, 20);
    const dayEvents = events.filter(e => e.date === date);
    dayEvents.forEach(e => {
      const startMin = timeToMinutes(e.time);
      allBusySlots.push({ start: startMin, end: startMin + (e.duration || 60) });
    });
  }

  // Find a slot where NONE of the phones are busy (8 AM - 10 PM)
  const freeSlots = [];
  for (let min = 8 * 60; min <= 22 * 60 - durationMinutes; min += 30) {
    const slotEnd = min + durationMinutes;
    const isFree = !allBusySlots.some(slot => min < slot.end && slotEnd > slot.start);
    if (isFree) {
      freeSlots.push({
        time: minutesToTime(min),
        endTime: minutesToTime(slotEnd),
        duration: durationMinutes,
      });
    }
  }

  return freeSlots.slice(0, 3); // Return top 3 options
}

// ─────────────────────────────────────────────────────────
// 4. SMART EXAM COUNTDOWN
// ─────────────────────────────────────────────────────────
async function getExamCountdowns(phone) {
  const events = await getEventsByPhone(phone, 30);
  const today = new Date();

  return events
    .filter(e => e.category === 'exam' && new Date(e.date) >= today)
    .map(e => {
      const daysLeft = Math.ceil((new Date(e.date) - today) / 86400000);
      const hoursLeft = Math.ceil((new Date(`${e.date}T${e.time}:00`) - today) / 3600000);
      return {
        ...e,
        daysLeft,
        hoursLeft,
        urgency: daysLeft <= 1 ? 'critical' : daysLeft <= 3 ? 'high' : daysLeft <= 7 ? 'medium' : 'low',
      };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

// ─────────────────────────────────────────────────────────
// 5. SMART RESCHEDULER — AI suggests best time to reschedule
// ─────────────────────────────────────────────────────────
async function suggestReschedule(phone, eventTitle) {
  const events = await getEventsByPhone(phone, 20);
  const today = new Date().toISOString().split('T')[0];

  const response = await groq.chat.completions.create({
    model: MODEL,
    messages: [{
      role: 'system',
      content: `You are a smart academic scheduler. Return ONLY JSON:
{ "suggestedDate": "YYYY-MM-DD", "suggestedTime": "HH:MM", "reason": "short reason" }`
    }, {
      role: 'user',
      content: `Student wants to reschedule "${eventTitle}". Today is ${today}.
Their existing events: ${JSON.stringify(events.map(e => ({ date: e.date, time: e.time, title: e.title })))}
Suggest the best date and time to reschedule, avoiding conflicts.`
    }],
    temperature: 0.4,
    max_tokens: 200,
  });

  try {
    const raw = response.choices[0].message.content.trim();
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────
function timeToMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

function getPriorityEmoji(priority) {
  return priority === 'high' ? '🔴' : priority === 'medium' ? '🟡' : '🟢';
}

module.exports = {
  sendDailyBrief,
  detectProcrastination,
  findGroupStudySlot,
  getExamCountdowns,
  suggestReschedule,
};
