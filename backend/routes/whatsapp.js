const express = require('express');
const router = express.Router();
const aiService = require('../services/aiService');
const calendarService = require('../services/calendarService');
const whatsappService = require('../services/whatsappService');
const dbService = require('../services/dbService');
const axios = require('axios');

// ─────────────────────────────────────────────
// Webhook
// ─────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  res.status(200).send('<Response></Response>');

  const { Body: message, From: from } = req.body;
  if (!message || !from) return;

  const phone = from.replace('whatsapp:', '');
  const lower = message.toLowerCase().trim();

  try {
    await dbService.saveUser(phone);
    await dbService.logMessage(phone, message, 'inbound');

    if (lower === 'help') return handleHelp(phone);
    if (lower === 'status') return handleStatus(phone);
    if (lower === 'schedule') return handleSchedule(phone);

    await handleEventCreation(phone, message);

  } catch (err) {
    console.error('❌ Webhook error:', err.message);
    await whatsappService.sendMessage(phone, `❌ Error: ${err.message}`);
  }
});

// ─────────────────────────────────────────────
// Event Creation (FIXED 🔥)
// ─────────────────────────────────────────────
async function handleEventCreation(phone, msg) {
  try {
    const parsed = await aiService.parseEventFromMessage(msg);

    console.log("🧠 AI Parsed:", parsed);

    if (!parsed.hasEvent) {
      return whatsappService.sendMessage(
        phone,
        `🤖 Couldn't detect an event.\nTry: "Math exam tomorrow at 10 AM"`
      );
    }

    // 🔥 Validate AI output
    if (!parsed.date || !parsed.time) {
      return whatsappService.sendMessage(
        phone,
        `⚠️ I understood the event but couldn't detect time properly.\nTry again with time.`
      );
    }

    // 🔥 Create Calendar Event safely
    let calEventId = null;

    try {
      const calEvent = await calendarService.createCalendarEvent(parsed);
      calEventId = calEvent.id;
    } catch (e) {
      console.error("❌ Calendar Error:", e.message);

      await whatsappService.sendMessage(
        phone,
        `⚠️ Event detected but failed to create calendar entry.\nReason: ${e.message}`
      );
    }

    // Save to DB
    const saved = await dbService.saveEvent(phone, parsed, calEventId);

    // Send confirmation
    await whatsappService.sendEventConfirmation(phone, parsed);

    // Optional: trigger automation
    triggerN8n({ phone, event: saved, calendarEventId: calEventId });

  } catch (err) {
    console.error("❌ Event creation error:", err.message);

    await whatsappService.sendMessage(
      phone,
      `❌ Failed to process event.\nTry again with clear format like:\n"Exam tomorrow at 10 AM"`
    );
  }
}

// ─────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────
async function handleStatus(phone) {
  const events = await dbService.getEventsByPhone(phone, 5);

  if (!events.length) {
    return whatsappService.sendMessage(phone, `📭 No upcoming events!`);
  }

  const list = events
    .map((e, i) => `${i + 1}. *${e.title}*\n📅 ${e.date} at ${e.time}`)
    .join('\n\n');

  await whatsappService.sendMessage(phone, `📋 *Upcoming Events:*\n\n${list}`);
}

async function handleSchedule(phone) {
  const events = await dbService.getEventsByPhone(phone, 10);

  if (!events.length) {
    return whatsappService.sendMessage(phone, `📭 No tasks found!`);
  }

  const schedule = await aiService.generateStudySchedule(events);

  await whatsappService.sendMessage(phone, `📚 *AI Study Schedule*\n\n${schedule}`);
}

async function handleHelp(phone) {
  await whatsappService.sendMessage(
    phone,
    `🎓 *CampusFlow Commands*

📌 Add event: "Math exam tomorrow at 10 AM"
📋 status — your events
📚 schedule — AI study plan
❓ help — this menu`
  );
}

// ─────────────────────────────────────────────
// Testing APIs
// ─────────────────────────────────────────────
router.post('/simulate', async (req, res) => {
  const { message, phone = '+919999999999' } = req.body;

  if (!message) return res.status(400).json({ error: 'message required' });

  try {
    await dbService.saveUser(phone);

    const lower = message.toLowerCase().trim();

    if (lower === 'help') return res.json({ success: true, type: 'help' });
    if (lower === 'status') return res.json({ success: true, type: 'status' });
    if (lower === 'schedule') return res.json({ success: true, type: 'schedule' });

    const parsed = await aiService.parseEventFromMessage(message);

    console.log("🧠 AI Parsed:", parsed);

    if (!parsed.hasEvent) {
      return res.json({ success: true, hasEvent: false, parsed });
    }

    let calEventId = null;

    try {
      const calEvent = await calendarService.createCalendarEvent(parsed);
      calEventId = calEvent.id;
    } catch (e) {
      console.warn('⚠️ Calendar skipped:', e.message);
    }

    const saved = await dbService.saveEvent(phone, parsed, calEventId);

    await whatsappService.sendEventConfirmation(phone, parsed);

    return res.json({ success: true, parsed, saved });

  } catch (err) {
    console.error('Simulate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// n8n trigger
// ─────────────────────────────────────────────
function triggerN8n(data) {
  if (!process.env.N8N_WEBHOOK_URL) return;

  axios
    .post(process.env.N8N_WEBHOOK_URL, data, { timeout: 5000 })
    .catch((e) => console.warn('n8n:', e.message));
}

module.exports = router;