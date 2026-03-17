const { getUpcomingEvents } = require('./dbService');
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function detectConflict(phone, newEvent) {
  const existing = await getUpcomingEvents(50);
  const userEvents = existing.filter(e => e.phone === phone);
  const newStart = toMinutes(newEvent.date, newEvent.time);
  const newEnd = newStart + (newEvent.duration || 60);
  const conflicts = userEvents.filter(e => {
    const eStart = toMinutes(e.date, e.time);
    const eEnd = eStart + (e.duration || 60);
    return newStart < eEnd && newEnd > eStart;
  });
  if (conflicts.length === 0) return { hasConflict: false };
  const suggestion = await getAIRescheduleSuggestion(newEvent, conflicts, userEvents);
  return { hasConflict: true, conflicts, suggestion };
}

async function getAIRescheduleSuggestion(newEvent, conflicts, allEvents) {
  const conflictList = conflicts.map(c => `"${c.title}" at ${c.date} ${c.time}`).join(', ');
  const res = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL || 'llama3-8b-8192',
    messages: [{
      role: 'system',
      content: 'You are a smart student scheduler. Return ONLY JSON: {"message":"friendly explanation","alternatives":[{"date":"YYYY-MM-DD","time":"HH:MM","reason":"why this works"}]}'
    }, {
      role: 'user',
      content: `New event "${newEvent.title}" on ${newEvent.date} at ${newEvent.time} conflicts with: ${conflictList}. Suggest 2 alternatives within 2 days.`
    }],
    temperature: 0.4, max_tokens: 300,
  });
  try {
    const raw = res.choices[0].message.content;
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { message: 'Schedule conflict detected.', alternatives: [] };
  } catch { return { message: 'Schedule conflict detected. Please choose another time.', alternatives: [] }; }
}

function toMinutes(date, time) {
  return new Date(`${date}T${time}:00`).getTime() / 60000;
}

module.exports = { detectConflict };
