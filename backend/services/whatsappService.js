const MOCK_MODE = !process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN;

if (MOCK_MODE) {
  console.log('📱 WhatsApp running in MOCK MODE — messages logged to console & dashboard');
}

function getTwilioClient() {
  const twilio = require('twilio');
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

const FROM = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
const mockMessageLog = [];

async function sendMessage(to, body) {
  if (MOCK_MODE) {
    const entry = {
      to, body,
      timestamp: new Date().toISOString(),
      sid: 'MOCK_' + Math.random().toString(36).substr(2, 9).toUpperCase(),
    };
    mockMessageLog.unshift(entry);
    if (mockMessageLog.length > 50) mockMessageLog.pop();
    console.log('\n📱 [MOCK WhatsApp] ─────────────────────────');
    console.log(`   To: ${to}`);
    console.log(`   Message:\n${body}`);
    console.log('────────────────────────────────────────────\n');
    return entry;
  }
  const client = getTwilioClient();
  const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  const message = await client.messages.create({ from: FROM, to: toFormatted, body });
  console.log(`📱 WhatsApp sent to ${to}: SID=${message.sid}`);
  return message;
}

async function sendEventConfirmation(to, event) {
  const dateStr = new Date(`${event.date}T${event.time}`).toLocaleString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long',
    day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const body =
`✅ *CampusFlow Event Created!*

📌 *${event.title}*
📅 ${dateStr}
⏱ Duration: ${event.duration} min
🔔 Reminders: ${(event.reminderMinutes || [60]).map(formatReminder).join(', ')}
🏷 Category: ${event.category}
⚡ Priority: ${event.priority}

Your event has been added to Google Calendar! 🎓`;
  return sendMessage(to, body);
}

async function sendReminder(to, event, minutesBefore) {
  const body =
`⏰ *CampusFlow Reminder!*

📌 *${event.title}* is in *${formatReminder(minutesBefore)}*!
📅 ${event.date} at ${event.time}
🏷 Category: ${event.category}

Stay on track! 💪`;
  return sendMessage(to, body);
}

async function sendWorkloadAlert(to, analysis) {
  const emoji = analysis.riskLevel === 'high' ? '🚨' : analysis.riskLevel === 'medium' ? '⚠️' : '✅';
  const body =
`${emoji} *Workload Check-In*

${analysis.message}

💡 *Tips:*
${analysis.suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}

— CampusFlow AI 🤖`;
  return sendMessage(to, body);
}

function formatReminder(minutes) {
  if (minutes < 60) return `${minutes} min before`;
  if (minutes === 60) return '1 hour before';
  if (minutes < 1440) return `${minutes / 60} hours before`;
  return `${minutes / 1440} day before`;
}

function getMockMessages() { return mockMessageLog; }
function isMockMode() { return MOCK_MODE; }

module.exports = {
  sendMessage,
  sendEventConfirmation,
  sendReminder,
  sendWorkloadAlert,
  getMockMessages,
  isMockMode,
};