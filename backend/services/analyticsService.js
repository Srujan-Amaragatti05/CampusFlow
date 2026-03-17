const { getDb } = require('../config/firebase');
const { getUpcomingEvents } = require('./dbService');
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─────────────────────────────────────────────────────────────
// Generate a full weekly analytics report
// ─────────────────────────────────────────────────────────────
async function generateWeeklyReport(phone) {
  const db = getDb();
  const allEvents = await getUpcomingEvents(100);
  const userEvents = allEvents.filter(e => e.phone === phone);

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);

  // Group by category
  const byCategory = userEvents.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + 1;
    return acc;
  }, {});

  // Group by day of week
  const byDay = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  userEvents.forEach(e => {
    const day = dayNames[new Date(e.date).getDay()];
    if (byDay[day] !== undefined) byDay[day]++;
  });

  // Busiest day
  const busiestDay = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];

  // Deadline hell detection (3+ events in same day)
  const byDate = userEvents.reduce((acc, e) => {
    acc[e.date] = (acc[e.date] || 0) + 1;
    return acc;
  }, {});
  const hellDays = Object.entries(byDate).filter(([, count]) => count >= 3);

  // Focus stats
  const focusDoc = await db.collection('focusStats').doc(phone).get();
  const focusStats = focusDoc.exists ? focusDoc.data() : { totalSessions: 0, totalMinutes: 0 };

  // Streak data
  const streakDoc = await db.collection('streaks').doc(phone).get();
  const streakData = streakDoc.exists ? streakDoc.data() : { streak: 0, totalXP: 0, badges: [] };

  // Calculate productivity score (0-100)
  const score = calculateProductivityScore(userEvents, focusStats, streakData);

  // AI generated insight
  const aiInsight = await generateWeeklyAIInsight(userEvents, focusStats, streakData, score);

  return {
    period: `${weekStart.toDateString()} – ${now.toDateString()}`,
    totalEvents: userEvents.length,
    byCategory,
    byDay,
    busiestDay: busiestDay ? { day: busiestDay[0], count: busiestDay[1] } : null,
    hellDays: hellDays.map(([date, count]) => ({ date, count })),
    focusSessions: focusStats.totalSessions,
    focusMinutes: focusStats.totalMinutes,
    streak: streakData.streak,
    totalXP: streakData.totalXP,
    badgeCount: (streakData.badges || []).length,
    productivityScore: score,
    aiInsight,
  };
}

function calculateProductivityScore(events, focusStats, streakData) {
  let score = 0;
  score += Math.min(30, events.length * 3);             // Up to 30 pts for events
  score += Math.min(20, (focusStats.totalSessions || 0) * 4); // Up to 20 pts for focus
  score += Math.min(25, (streakData.streak || 0) * 5);  // Up to 25 pts for streak
  score += Math.min(15, (streakData.badges?.length || 0) * 3); // Up to 15 pts for badges
  score += Math.min(10, Math.floor((streakData.totalXP || 0) / 100)); // XP bonus
  return Math.min(100, Math.round(score));
}

async function generateWeeklyAIInsight(events, focusStats, streakData, score) {
  const summary = `${events.length} events planned, ${focusStats.totalSessions || 0} focus sessions (${focusStats.totalMinutes || 0} min), ${streakData.streak || 0}-day streak, score ${score}/100`;

  const res = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL || 'llama3-8b-8192',
    messages: [{
      role: 'system', content: 'You are an upbeat academic coach. Write a 2-sentence weekly summary that highlights wins and gives ONE specific improvement tip. Be encouraging.'
    }, {
      role: 'user', content: `Weekly stats: ${summary}`
    }],
    temperature: 0.7, max_tokens: 150,
  });
  return res.choices[0].message.content;
}

// ─────────────────────────────────────────────────────────────
// Format weekly report for WhatsApp
// ─────────────────────────────────────────────────────────────
function formatWeeklyReportWhatsApp(report) {
  const scoreEmoji = report.productivityScore >= 80 ? '🏆' : report.productivityScore >= 60 ? '⭐' : report.productivityScore >= 40 ? '📈' : '💪';
  const categoryList = Object.entries(report.byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => `  • ${cat}: ${count}`)
    .join('\n');

  return `📊 *Your Weekly CampusFlow Report*\n` +
    `📅 ${report.period}\n\n` +
    `${scoreEmoji} *Productivity Score: ${report.productivityScore}/100*\n\n` +
    `📌 *Events Planned:* ${report.totalEvents}\n${categoryList}\n\n` +
    `🍅 *Focus Sessions:* ${report.focusSessions} (${report.focusMinutes} min)\n` +
    `🔥 *Streak:* ${report.streak} days\n` +
    `⚡ *XP Earned:* ${report.totalXP}\n` +
    `🏅 *Badges:* ${report.badgeCount}\n\n` +
    (report.hellDays.length > 0
      ? `⚠️ *Busy Days Ahead:* ${report.hellDays.map(d => `${d.date} (${d.count} tasks)`).join(', ')}\n\n`
      : '') +
    `🤖 *AI Insight:*\n${report.aiInsight}\n\n` +
    `_Keep crushing it!_ 🚀`;
}

// ─────────────────────────────────────────────────────────────
// Get heatmap data for dashboard (events per day for last 30 days)
// ─────────────────────────────────────────────────────────────
async function getHeatmapData(days = 30) {
  const events = await getUpcomingEvents(200);
  const heatmap = {};
  const now = new Date();

  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const key = d.toISOString().split('T')[0];
    heatmap[key] = 0;
  }

  events.forEach(e => {
    if (heatmap[e.date] !== undefined) heatmap[e.date]++;
  });

  return heatmap;
}

module.exports = { generateWeeklyReport, formatWeeklyReportWhatsApp, getHeatmapData, calculateProductivityScore };
