const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const axios = require('axios');

// ─────────────────────────────────────────────────────────────
// Parse a timetable image (URL from Twilio media) using Groq vision
// Returns array of events to bulk-create
// ─────────────────────────────────────────────────────────────
async function parseTimetableImage(imageUrl, twilioSid, twilioToken) {
  // Download image and convert to base64
  const response = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    auth: { username: twilioSid, password: twilioToken },
  });

  const base64Image = Buffer.from(response.data).toString('base64');
  const mimeType = response.headers['content-type'] || 'image/jpeg';

  const today = new Date().toISOString().split('T')[0];
  const nextMonday = getNextMonday();

  const res = await groq.chat.completions.create({
    model: 'llama-3.2-11b-vision-preview', // Groq vision model
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${base64Image}` },
        },
        {
          type: 'text',
          text: `Extract ALL classes/events from this timetable image. Today is ${today}, next week starts ${nextMonday}.
Return ONLY a JSON array of events:
[{
  "title": "Subject name + type (e.g. Mathematics Lecture)",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "endTime": "HH:MM",
  "duration": 60,
  "category": "lecture|lab|tutorial|exam",
  "priority": "high|medium|low",
  "reminderMinutes": [30, 1440]
}]
Map days of week to actual dates starting from next Monday. Return empty array [] if no timetable found.`,
        },
      ],
    }],
    temperature: 0.1,
    max_tokens: 2000,
  });

  const raw = res.choices[0].message.content.trim();
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    return [];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// Parse text-based timetable (pasted as message)
// e.g. "Mon 9-10 Maths, 10-11 Physics, Tue 9-10 Chemistry"
// ─────────────────────────────────────────────────────────────
async function parseTextTimetable(text) {
  const today = new Date().toISOString().split('T')[0];
  const nextMonday = getNextMonday();

  const res = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL || 'llama3-8b-8192',
    messages: [{
      role: 'system',
      content: `Extract ALL classes from a student's timetable text. Today is ${today}, next Monday is ${nextMonday}.
Return ONLY a JSON array:
[{"title":"","date":"YYYY-MM-DD","time":"HH:MM","endTime":"HH:MM","duration":60,"category":"lecture","priority":"medium","reminderMinutes":[30,1440]}]`,
    }, {
      role: 'user',
      content: `Extract all classes from this timetable: "${text}"`,
    }],
    temperature: 0.1, max_tokens: 1500,
  });

  try {
    const raw = res.choices[0].message.content;
    const match = raw.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  } catch { return []; }
}

function getNextMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function isTimetableMessage(message) {
  const keywords = ['timetable', 'time table', 'schedule for', 'weekly schedule', 'class schedule', 'semester schedule'];
  return keywords.some(k => message.toLowerCase().includes(k));
}

module.exports = { parseTimetableImage, parseTextTimetable, isTimetableMessage, getNextMonday };
