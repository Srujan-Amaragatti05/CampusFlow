const { getDb } = require('../config/firebase');
const whatsappService = require('./whatsappService');

const POMODORO_DURATION = 25; // minutes
const SHORT_BREAK = 5;
const LONG_BREAK = 15;

// ─────────────────────────────────────────────────────────────
// Start a Pomodoro session for a student
// ─────────────────────────────────────────────────────────────
async function startPomodoro(phone, taskName = 'Study Session') {
  const db = getDb();
  const ref = db.collection('pomodoro').doc(phone);

  const session = {
    phone,
    taskName,
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + POMODORO_DURATION * 60000).toISOString(),
    status: 'active',
    sessionNumber: await getSessionCount(phone) + 1,
  };

  await ref.set(session);

  // Schedule end notification using setTimeout (in production use a queue)
  setTimeout(async () => {
    try {
      const doc = await ref.get();
      if (doc.exists && doc.data().status === 'active') {
        await endPomodoro(phone, true);
      }
    } catch (e) { console.error('Pomodoro end error:', e.message); }
  }, POMODORO_DURATION * 60 * 1000);

  return session;
}

async function endPomodoro(phone, auto = false) {
  const db = getDb();
  const ref = db.collection('pomodoro').doc(phone);
  const doc = await ref.get();
  if (!doc.exists) return null;

  const session = doc.data();
  const actualDuration = Math.round((Date.now() - new Date(session.startTime).getTime()) / 60000);

  await ref.update({ status: 'completed', actualDuration, completedAt: new Date().toISOString() });

  // Update focus stats
  const statsRef = db.collection('focusStats').doc(phone);
  const statsDoc = await statsRef.get();
  const stats = statsDoc.exists ? statsDoc.data() : { totalSessions: 0, totalMinutes: 0 };
  await statsRef.set({
    totalSessions: stats.totalSessions + 1,
    totalMinutes: stats.totalMinutes + actualDuration,
    lastSession: new Date().toISOString(),
  }, { merge: true });

  const sessionNum = session.sessionNumber || 1;
  const needsLongBreak = sessionNum % 4 === 0;
  const breakTime = needsLongBreak ? LONG_BREAK : SHORT_BREAK;

  if (auto) {
    await whatsappService.sendMessage(phone,
      `⏰ *Pomodoro Complete!* 🍅\n\n` +
      `✅ Finished: *${session.taskName}*\n` +
      `⏱ Focus time: ${actualDuration} minutes\n` +
      `🔢 Session #${sessionNum}\n\n` +
      `${needsLongBreak ? `🎉 Amazing! Take a *${LONG_BREAK}-minute long break* — you earned it!` : `☕ Take a *${SHORT_BREAK}-minute break* then come back stronger!`}\n\n` +
      `_Reply "pomodoro [task]" to start next session_`
    );
  }

  return { session, breakTime, needsLongBreak };
}

async function getPomodoroStatus(phone) {
  const db = getDb();
  const doc = await db.collection('pomodoro').doc(phone).get();
  if (!doc.exists) return null;
  const data = doc.data();
  if (data.status !== 'active') return null;
  const remaining = Math.max(0, Math.round((new Date(data.endTime) - Date.now()) / 60000));
  return { ...data, remainingMinutes: remaining };
}

async function getFocusStats(phone) {
  const db = getDb();
  const doc = await db.collection('focusStats').doc(phone).get();
  return doc.exists ? doc.data() : { totalSessions: 0, totalMinutes: 0 };
}

async function getSessionCount(phone) {
  const db = getDb();
  const doc = await db.collection('focusStats').doc(phone).get();
  return doc.exists ? (doc.data().totalSessions || 0) : 0;
}

module.exports = { startPomodoro, endPomodoro, getPomodoroStatus, getFocusStats };
