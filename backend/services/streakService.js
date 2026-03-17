const { getDb } = require('../config/firebase');
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const BADGES = {
  FIRST_EVENT:    { id: 'first_event',    emoji: '🌱', name: 'First Step',       desc: 'Created your first event' },
  STREAK_3:       { id: 'streak_3',       emoji: '🔥', name: 'On Fire',          desc: '3-day study streak' },
  STREAK_7:       { id: 'streak_7',       emoji: '⚡', name: 'Lightning Learner', desc: '7-day study streak' },
  STREAK_30:      { id: 'streak_30',      emoji: '👑', name: 'Study King',        desc: '30-day study streak' },
  EARLY_BIRD:     { id: 'early_bird',     emoji: '🌅', name: 'Early Bird',        desc: 'Added event before 7 AM' },
  PLANNER:        { id: 'planner',        emoji: '📋', name: 'Master Planner',    desc: 'Added 10+ events' },
  EXAM_SURVIVOR:  { id: 'exam_survivor',  emoji: '🎯', name: 'Exam Survivor',     desc: 'Completed 5 exams' },
  OVERACHIEVER:   { id: 'overachiever',   emoji: '🚀', name: 'Overachiever',      desc: 'Completed task 2h before deadline' },
  NIGHT_OWL:      { id: 'night_owl',      emoji: '🦉', name: 'Night Owl',         desc: 'Added event after midnight' },
  CONSISTENT:     { id: 'consistent',     emoji: '💎', name: 'Diamond Consistency','desc': '14-day streak' },
};

// ─────────────────────────────────────────────────────────────
// Update streak when a student adds an event
// ─────────────────────────────────────────────────────────────
async function updateStreak(phone, eventData) {
  const db = getDb();
  const ref = db.collection('streaks').doc(phone);
  const doc = await ref.get();

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const hour = now.getHours();

  let data = doc.exists ? doc.data() : {
    phone, streak: 0, longestStreak: 0, lastActiveDate: null,
    totalEvents: 0, totalXP: 0, badges: [], completedExams: 0,
  };

  // Calculate streak
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  if (data.lastActiveDate === today) {
    // Already counted today
  } else if (data.lastActiveDate === yesterdayStr) {
    data.streak += 1;
  } else if (data.lastActiveDate !== today) {
    data.streak = 1; // Reset streak
  }

  data.longestStreak = Math.max(data.streak, data.longestStreak || 0);
  data.lastActiveDate = today;
  data.totalEvents = (data.totalEvents || 0) + 1;

  // XP system
  const xpGained = calculateXP(eventData);
  data.totalXP = (data.totalXP || 0) + xpGained;

  // Check for exam completions
  if (eventData.category === 'exam') {
    data.completedExams = (data.completedExams || 0) + 1;
  }

  // Unlock badges
  const newBadges = checkBadges(data, eventData, hour);
  const existingBadgeIds = (data.badges || []).map(b => b.id);
  const unlocked = newBadges.filter(b => !existingBadgeIds.includes(b.id));
  data.badges = [...(data.badges || []), ...unlocked];

  await ref.set(data, { merge: true });

  return {
    streak: data.streak,
    xpGained,
    totalXP: data.totalXP,
    newBadges: unlocked,
    longestStreak: data.longestStreak,
  };
}

function calculateXP(eventData) {
  let xp = 10; // Base XP
  if (eventData.priority === 'high') xp += 20;
  if (eventData.priority === 'medium') xp += 10;
  if (eventData.category === 'exam') xp += 30;
  if (eventData.category === 'assignment') xp += 15;
  return xp;
}

function checkBadges(data, eventData, hour) {
  const badges = [];
  if (data.totalEvents === 1) badges.push(BADGES.FIRST_EVENT);
  if (data.streak >= 3) badges.push(BADGES.STREAK_3);
  if (data.streak >= 7) badges.push(BADGES.STREAK_7);
  if (data.streak >= 14) badges.push(BADGES.CONSISTENT);
  if (data.streak >= 30) badges.push(BADGES.STREAK_30);
  if (hour < 7) badges.push(BADGES.EARLY_BIRD);
  if (hour >= 0 && hour < 4) badges.push(BADGES.NIGHT_OWL);
  if (data.totalEvents >= 10) badges.push(BADGES.PLANNER);
  if (data.completedExams >= 5) badges.push(BADGES.EXAM_SURVIVOR);
  return badges;
}

async function getStreakData(phone) {
  const db = getDb();
  const doc = await db.collection('streaks').doc(phone).get();
  if (!doc.exists) return { streak: 0, totalXP: 0, badges: [], longestStreak: 0 };
  return doc.data();
}

// ─────────────────────────────────────────────────────────────
// Generate motivational message based on streak
// ─────────────────────────────────────────────────────────────
async function generateMotivationalMessage(streakData, studentName = 'Student') {
  const res = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL || 'llama3-8b-8192',
    messages: [{
      role: 'system', content: 'You are an energetic academic coach. Give a 1-sentence motivational message. Be specific and fun.'
    }, {
      role: 'user',
      content: `Student "${studentName}" has a ${streakData.streak}-day streak, ${streakData.totalXP} XP, and ${streakData.badges?.length || 0} badges. Motivate them!`
    }],
    temperature: 0.9, max_tokens: 100,
  });
  return res.choices[0].message.content;
}

// Format streak message for WhatsApp
function formatStreakMessage(streakResult) {
  const lines = [
    `\n🔥 *Streak: ${streakResult.streak} days*`,
    `⚡ *+${streakResult.xpGained} XP* (Total: ${streakResult.totalXP} XP)`,
  ];
  if (streakResult.newBadges.length > 0) {
    lines.push(`\n🏆 *New Badge Unlocked!*`);
    streakResult.newBadges.forEach(b => lines.push(`${b.emoji} ${b.name} — ${b.desc}`));
  }
  return lines.join('\n');
}

module.exports = { updateStreak, getStreakData, generateMotivationalMessage, formatStreakMessage };
