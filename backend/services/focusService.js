const { getDb } = require('../config/firebase');
const whatsappService = require('./whatsappService');
const gamificationService = require('./gamificationService');

const POMODORO_DURATION = 25; // minutes
const SHORT_BREAK = 5;
const LONG_BREAK = 15;

async function startFocusSession(phone, taskName) {
  const db = getDb();
  const sessionId = `${phone}-${Date.now()}`;

  const session = {
    id: sessionId,
    phone,
    taskName: taskName || 'Deep Work',
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + POMODORO_DURATION * 60000).toISOString(),
    status: 'active',
    durationMinutes: POMODORO_DURATION,
  };

  await db.collection('focus_sessions').doc(sessionId).set(session);

  await whatsappService.sendMessage(phone,
    `🎯 *Focus Mode Activated!*\n\n` +
    `📌 Task: *${session.taskName}*\n` +
    `⏱ Duration: *${POMODORO_DURATION} minutes*\n\n` +
    `🔕 Put your phone down.\n` +
    `💪 You've got this! I'll ping you when it's done.\n\n` +
    `_— CampusFlow Focus Engine_`
  );

  // Schedule end-of-session message using setTimeout
  setTimeout(async () => {
    await endFocusSession(sessionId, phone, session.taskName);
  }, POMODORO_DURATION * 60000);

  return session;
}

async function endFocusSession(sessionId, phone, taskName) {
  const db = getDb();
  await db.collection('focus_sessions').doc(sessionId).update({
    status: 'completed',
    completedAt: new Date().toISOString(),
  });

  const result = await gamificationService.completeFocusSession(phone);

  let badgeText = '';
  if (result.newBadges.length > 0) {
    badgeText = `\n\n🏅 *New Badge Unlocked!*\n` +
      result.newBadges.map(b => `${b.name} — ${b.desc}`).join('\n');
  }

  await whatsappService.sendMessage(phone,
    `✅ *Focus Session Complete!*\n\n` +
    `📌 Task: *${taskName}*\n` +
    `🎉 25 minutes of pure focus!\n` +
    `✨ +${result.xpResult.xpGained} XP earned\n\n` +
    `☕ Take a 5-minute break, then keep going!` +
    badgeText
  );
}

async function getActiveSessions(phone) {
  const db = getDb();
  const snap = await db.collection('focus_sessions')
    .where('phone', '==', phone)
    .where('status', '==', 'active')
    .get();
  return snap.docs.map(d => d.data());
}

async function getFocusStats(phone) {
  const db = getDb();
  const snap = await db.collection('focus_sessions')
    .where('phone', '==', phone)
    .where('status', '==', 'completed')
    .get();

  const sessions = snap.docs.map(d => d.data());
  const totalMinutes = sessions.length * POMODORO_DURATION;
  const totalHours = Math.floor(totalMinutes / 60);

  return {
    totalSessions: sessions.length,
    totalMinutes,
    totalHours,
    todaySessions: sessions.filter(s =>
      s.completedAt?.startsWith(new Date().toISOString().split('T')[0])
    ).length,
  };
}

module.exports = { startFocusSession, endFocusSession, getActiveSessions, getFocusStats };
