const cron = require('node-cron');
const dbService = require('./dbService');
const whatsappService = require('./whatsappService');
const aiService = require('./aiService');
const smartFeatures = require('./smartFeatures');

// Run every 5 minutes — check for pending reminders
function startCronJobs() {
  console.log('⏰ Starting CampusFlow reminder cron jobs...');

  // Check reminders every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      await checkAndSendReminders();
    } catch (err) {
      console.error('❌ Reminder cron error:', err.message);
    }
  });

  // Daily brief — every day at 8 AM
  cron.schedule('0 8 * * *', async () => {
    try {
      const events = await dbService.getUpcomingEvents(100);
      const phones = [...new Set(events.map(e => e.phone))];
      for (const phone of phones) {
        await smartFeatures.sendDailyBrief(phone);
      }
    } catch (err) {
      console.error('❌ Daily brief cron error:', err.message);
    }
  });

  // Weekly workload analysis — every Monday at 8 AM
  cron.schedule('0 8 * * 1', async () => {
    try {
      await sendWeeklyWorkloadInsights();
    } catch (err) {
      console.error('❌ Weekly insights cron error:', err.message);
    }
  });

  console.log('✅ Cron jobs started.');
}

async function checkAndSendReminders() {
  const events = await dbService.getUpcomingEvents(100);
  const now = new Date();

  for (const event of events) {
    const eventTime = new Date(`${event.date}T${event.time}:00`);
    const minutesUntilEvent = Math.round((eventTime - now) / 60000);

    const scheduledReminders = event.remindersScheduled || [30, 60, 1440];
    const sentReminders = event.remindersSent || [];

    for (const minutesBefore of scheduledReminders) {
      if (sentReminders.includes(minutesBefore)) continue;

      // Send if we're within a 5-minute window of the reminder time
      const diff = Math.abs(minutesUntilEvent - minutesBefore);
      if (diff <= 5) {
        console.log(`🔔 Sending reminder: ${event.title} — ${minutesBefore} min before`);
        await whatsappService.sendReminder(event.phone, event, minutesBefore);
        await dbService.markReminderSent(event.id, minutesBefore);
      }
    }
  }
}

async function sendWeeklyWorkloadInsights() {
  const events = await dbService.getUpcomingEvents(50);

  // Group by phone
  const byPhone = events.reduce((acc, e) => {
    if (!acc[e.phone]) acc[e.phone] = [];
    acc[e.phone].push(e);
    return acc;
  }, {});

  for (const [phone, tasks] of Object.entries(byPhone)) {
    if (tasks.length === 0) continue;

    const analysis = await aiService.detectWorkloadOverload(tasks);
    if (analysis.isOverloaded || analysis.riskLevel !== 'low') {
      await whatsappService.sendWorkloadAlert(phone, analysis);
    }
  }
}

module.exports = { startCronJobs, checkAndSendReminders };
