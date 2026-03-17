const { getDb } = require('../config/firebase');

const BADGES = {
  first_event:     { id: 'first_event',     name: '🎯 First Step',      desc: 'Created your first event',          xp: 50  },
  streak_3:        { id: 'streak_3',         name: '🔥 On Fire',         desc: '3-day streak',                       xp: 100 },
  streak_7:        { id: 'streak_7',         name: '⚡ Week Warrior',    desc: '7-day streak',                       xp: 250 },
  streak_30:       { id: 'streak_30',        name: '🏆 Unstoppable',     desc: '30-day streak',                      xp: 1000},
  events_10:       { id: 'events_10',        name: '📅 Planner',         desc: '10 events created',                  xp: 150 },
  events_50:       { id: 'events_50',        name: '🗓 Scheduler Pro',   desc: '50 events created',                  xp: 500 },
  no_conflicts:    { id: 'no_conflicts',     name: '🧠 Smart Planner',   desc: 'Avoided 5 conflicts',                xp: 200 },
  focus_1:         { id: 'focus_1',          name: '🎯 Focused',         desc: 'Completed first focus session',      xp: 75  },
  focus_10:        { id: 'focus_10',         name: '🧘 Deep Work',       desc: '10 focus sessions completed',        xp: 300 },
  early_bird:      { id: 'early_bird',       name: '🌅 Early Bird',      desc: 'Created event before 7 AM',         xp: 100 },
  night_owl:       { id: 'night_owl',        name: '🦉 Night Owl',       desc: 'Created event after 11 PM',         xp: 100 },
  all_categories:  { id: 'all_categories',   name: '🎓 Renaissance',     desc: 'Used all event categories',          xp: 300 },
};

const LEVELS = [
  { level: 1, name: 'Freshman',     xpRequired: 0    },
  { level: 2, name: 'Sophomore',    xpRequired: 200  },
  { level: 3, name: 'Junior',       xpRequired: 500  },
  { level: 4, name: 'Senior',       xpRequired: 1000 },
  { level: 5, name: 'Graduate',     xpRequired: 2000 },
  { level: 6, name: 'Scholar',      xpRequired: 3500 },
  { level: 7, name: 'Professor',    xpRequired: 5000 },
  { level: 8, name: 'Legend',       xpRequired: 8000 },
];

async function getProfile(phone) {
  const db = getDb();
  const doc = await db.collection('gamification').doc(phone).get();
  if (!doc.exists) {
    return {
      phone,
      xp: 0,
      level: 1,
      levelName: 'Freshman',
      streak: 0,
      longestStreak: 0,
      badges: [],
      totalEvents: 0,
      focusSessions: 0,
      lastActiveDate: null,
      categoriesUsed: [],
      conflictsAvoided: 0,
    };
  }
  return doc.data();
}

async function awardXP(phone, amount, reason) {
  const db = getDb();
  const profile = await getProfile(phone);

  profile.xp = (profile.xp || 0) + amount;

  // Recalculate level
  const newLevel = LEVELS.slice().reverse().find(l => profile.xp >= l.xpRequired) || LEVELS[0];
  const leveledUp = newLevel.level > (profile.level || 1);

  profile.level = newLevel.level;
  profile.levelName = newLevel.name;

  await db.collection('gamification').doc(phone).set(profile, { merge: true });
  await db.collection('xp_log').add({ phone, amount, reason, timestamp: new Date().toISOString() });

  return { newXP: profile.xp, leveledUp, newLevel: newLevel.name, xpGained: amount };
}

async function updateStreak(phone) {
  const db = getDb();
  const profile = await getProfile(phone);
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  let streak = profile.streak || 0;

  if (profile.lastActiveDate === today) {
    // Already counted today
  } else if (profile.lastActiveDate === yesterday) {
    streak += 1;
  } else {
    streak = 1; // Reset streak
  }

  const longestStreak = Math.max(streak, profile.longestStreak || 0);

  await db.collection('gamification').doc(phone).set({
    ...profile, streak, longestStreak, lastActiveDate: today,
  }, { merge: true });

  return streak;
}

async function checkAndAwardBadges(phone, eventData) {
  const db = getDb();
  const profile = await getProfile(phone);
  const newBadges = [];

  const existingBadgeIds = (profile.badges || []).map(b => b.id);

  // Update stats
  const totalEvents = (profile.totalEvents || 0) + 1;
  const categoriesUsed = [...new Set([...(profile.categoriesUsed || []), eventData.category])];
  const streak = await updateStreak(phone);

  await db.collection('gamification').doc(phone).set({
    totalEvents, categoriesUsed,
  }, { merge: true });

  const check = (badgeId, condition) => {
    if (condition && !existingBadgeIds.includes(badgeId)) {
      newBadges.push(BADGES[badgeId]);
    }
  };

  check('first_event', totalEvents === 1);
  check('events_10', totalEvents >= 10);
  check('events_50', totalEvents >= 50);
  check('streak_3', streak >= 3);
  check('streak_7', streak >= 7);
  check('streak_30', streak >= 30);
  check('all_categories', categoriesUsed.length >= 6);

  const hour = parseInt(eventData.time?.split(':')[0] || 12);
  check('early_bird', hour < 7);
  check('night_owl', hour >= 23);

  // Save new badges
  if (newBadges.length > 0) {
    const allBadges = [...(profile.badges || []), ...newBadges];
    await db.collection('gamification').doc(phone).set({ badges: allBadges }, { merge: true });

    // Award XP for badges
    for (const badge of newBadges) {
      await awardXP(phone, badge.xp, `Badge: ${badge.name}`);
    }
  }

  // Award XP for creating event
  const xpResult = await awardXP(phone, 25, 'Event created');

  return { newBadges, xpResult, streak };
}

async function completeFocusSession(phone) {
  const db = getDb();
  const profile = await getProfile(phone);
  const focusSessions = (profile.focusSessions || 0) + 1;

  await db.collection('gamification').doc(phone).set({ focusSessions }, { merge: true });

  const newBadges = [];
  const existingBadgeIds = (profile.badges || []).map(b => b.id);

  if (focusSessions === 1 && !existingBadgeIds.includes('focus_1')) newBadges.push(BADGES.focus_1);
  if (focusSessions >= 10 && !existingBadgeIds.includes('focus_10')) newBadges.push(BADGES.focus_10);

  if (newBadges.length > 0) {
    const allBadges = [...(profile.badges || []), ...newBadges];
    await db.collection('gamification').doc(phone).set({ badges: allBadges }, { merge: true });
    for (const badge of newBadges) await awardXP(phone, badge.xp, `Badge: ${badge.name}`);
  }

  const xpResult = await awardXP(phone, 50, 'Focus session completed');
  return { focusSessions, newBadges, xpResult };
}

async function getLeaderboard(limit = 10) {
  const db = getDb();
  const snap = await db.collection('gamification').orderBy('xp', 'desc').limit(limit).get();
  return snap.docs.map((d, i) => ({ rank: i + 1, ...d.data() }));
}

function getLevelProgress(xp) {
  const currentLevel = LEVELS.slice().reverse().find(l => xp >= l.xpRequired) || LEVELS[0];
  const nextLevel = LEVELS.find(l => l.level === currentLevel.level + 1);

  if (!nextLevel) return { currentLevel, nextLevel: null, progress: 100, xpToNext: 0 };

  const xpInLevel = xp - currentLevel.xpRequired;
  const xpNeeded = nextLevel.xpRequired - currentLevel.xpRequired;
  const progress = Math.round((xpInLevel / xpNeeded) * 100);

  return { currentLevel, nextLevel, progress, xpToNext: nextLevel.xpRequired - xp };
}

module.exports = {
  getProfile,
  awardXP,
  updateStreak,
  checkAndAwardBadges,
  completeFocusSession,
  getLeaderboard,
  getLevelProgress,
  BADGES,
  LEVELS,
};
