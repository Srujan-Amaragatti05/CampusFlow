const { getDb } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');

// ─── Events ──────────────────────────────────────────────────

async function saveEvent(phone, eventData, googleEventId) {
  const db = getDb();
  const id = uuidv4();

  const record = {
    id,
    phone,
    ...eventData,
    googleEventId,
    status: 'active',
    createdAt: new Date().toISOString(),
    remindersScheduled: eventData.reminderMinutes || [30, 60],
    remidersSent: [],
  };

  await db.collection('events').doc(id).set(record);
  console.log(`💾 Event saved to Firestore: ${id}`);
  return record;
}

async function getEventsByPhone(phone, limit = 20) {
  const db = getDb();
  const snap = await db
    .collection('events')
    .where('phone', '==', phone)
    .where('status', '==', 'active')
    .orderBy('date', 'asc')
    .limit(limit)
    .get();

  return snap.docs.map((d) => d.data());
}

async function getUpcomingEvents(limit = 50) {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  const snap = await db
    .collection('events')
    .where('status', '==', 'active')
    .where('date', '>=', today)
    .orderBy('date', 'asc')
    .limit(limit)
    .get();

  return snap.docs.map((d) => d.data());
}

async function markReminderSent(eventId, minutesBefore) {
  const db = getDb();
  const ref = db.collection('events').doc(eventId);
  const doc = await ref.get();

  if (doc.exists) {
    const current = doc.data().remindersSent || [];
    await ref.update({ remindersSent: [...current, minutesBefore] });
  }
}

async function updateEventStatus(eventId, status) {
  const db = getDb();
  await db.collection('events').doc(eventId).update({ status, updatedAt: new Date().toISOString() });
}

// ─── User / Session ──────────────────────────────────────────

async function saveUser(phone, data = {}) {
  const db = getDb();
  const ref = db.collection('users').doc(phone);
  const existing = await ref.get();

  if (!existing.exists) {
    await ref.set({ phone, createdAt: new Date().toISOString(), ...data });
  } else {
    await ref.update({ lastSeen: new Date().toISOString(), ...data });
  }
}

async function getUser(phone) {
  const db = getDb();
  const doc = await db.collection('users').doc(phone).get();
  return doc.exists ? doc.data() : null;
}

// ─── Message Logs ────────────────────────────────────────────

async function logMessage(phone, message, direction = 'inbound', parsed = null) {
  const db = getDb();
  await db.collection('messages').add({
    phone,
    message,
    direction,
    parsed,
    timestamp: new Date().toISOString(),
  });
}

// ─── Dashboard Stats ─────────────────────────────────────────

async function getDashboardStats() {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  const [totalEvents, todayEvents, users] = await Promise.all([
    db.collection('events').where('status', '==', 'active').get(),
    db.collection('events').where('date', '==', today).get(),
    db.collection('users').get(),
  ]);

  return {
    totalActiveEvents: totalEvents.size,
    eventsToday: todayEvents.size,
    totalUsers: users.size,
  };
}

module.exports = {
  saveEvent,
  getEventsByPhone,
  getUpcomingEvents,
  markReminderSent,
  updateEventStatus,
  saveUser,
  getUser,
  logMessage,
  getDashboardStats,
};
