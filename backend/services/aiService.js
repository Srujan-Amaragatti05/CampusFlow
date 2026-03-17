const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GROQ_MODEL || 'llama3-8b-8192';

// ─────────────────────────────────────────────────────────────
// 1. Parse WhatsApp message → structured event
// ─────────────────────────────────────────────────────────────
async function parseEventFromMessage(message) {
  const today = new Date().toISOString().split('T')[0];

  const systemPrompt = `You are an AI assistant for CampusFlow, a student productivity platform.
Your job is to extract calendar event details from natural student messages.
Today's date is ${today}.

RULES:
- Always return valid JSON only — no explanation, no markdown, no extra text.
- If the message has no event/reminder intent, set "hasEvent" to false.
- Infer the year as current year unless stated otherwise.
- If only "tomorrow" is mentioned, add 1 day to today's date.
- Default time is 09:00 if not mentioned.
- If a time RANGE is given like "2pm to 3pm", "14:00-15:00", "from 10am to 12pm",
  set "time" to start time, "endTime" to end time, and calculate "duration" in minutes.
- If only a start time is given with no end, set "endTime" to null and duration to 60.

RETURN THIS EXACT JSON SHAPE:
{
  "hasEvent": true,
  "title": "Algorithms Class",
  "date": "2026-03-18",
  "time": "14:00",
  "endTime": "15:00",
  "duration": 60,
  "description": "Original message context",
  "priority": "high | medium | low",
  "category": "assignment | exam | lecture | meeting | personal | other",
  "reminderMinutes": [30, 60, 1440]
}`;

  const userPrompt = `Extract event from this student message: "${message}"`;

  const response = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.1,
    max_tokens: 500,
  });

  const raw = response.choices[0].message.content.trim();

  try {
    return JSON.parse(raw);
  } catch {
    // Try to extract JSON if model added extra text
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('AI returned invalid JSON: ' + raw);
  }
}

// ─────────────────────────────────────────────────────────────
// 2. Generate study schedule suggestion
// ─────────────────────────────────────────────────────────────
async function generateStudySchedule(tasks) {
  const taskList = tasks
    .map((t) => `- ${t.title} due ${t.date} at ${t.time} (priority: ${t.priority})`)
    .join('\n');

  const response = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a smart academic coach. Create a realistic, encouraging study schedule 
for a student. Be concise, friendly, and practical. Use bullet points.`,
      },
      {
        role: 'user',
        content: `Here are my upcoming tasks:\n${taskList}\n\nSuggest an optimal study schedule for the next 3 days.`,
      },
    ],
    temperature: 0.7,
    max_tokens: 600,
  });

  return response.choices[0].message.content;
}

// ─────────────────────────────────────────────────────────────
// 3. Detect workload overload
// ─────────────────────────────────────────────────────────────
async function detectWorkloadOverload(tasks) {
  const taskList = JSON.stringify(
    tasks.map((t) => ({ title: t.title, date: t.date, priority: t.priority, category: t.category }))
  );

  const response = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `You are an academic wellbeing advisor. Analyze student workload and return ONLY valid JSON:
{
  "isOverloaded": true,
  "riskLevel": "high | medium | low",
  "message": "friendly short message to student",
  "suggestions": ["tip1", "tip2", "tip3"]
}`,
      },
      {
        role: 'user',
        content: `Analyze this task list for workload overload: ${taskList}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 400,
  });

  const raw = response.choices[0].message.content.trim();
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return { isOverloaded: false, riskLevel: 'low', message: 'Workload looks manageable!', suggestions: [] };
  }
}

// ─────────────────────────────────────────────────────────────
// 4. Generate productivity insight
// ─────────────────────────────────────────────────────────────
async function generateProductivityInsight(completedTasks, upcomingTasks) {
  const response = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: 'You are a motivating academic productivity coach. Give a 2-3 sentence insight based on student data. Be encouraging and specific.',
      },
      {
        role: 'user',
        content: `Completed tasks this week: ${completedTasks}. Upcoming tasks: ${upcomingTasks}. Give a productivity insight.`,
      },
    ],
    temperature: 0.8,
    max_tokens: 200,
  });

  return response.choices[0].message.content;
}

module.exports = {
  parseEventFromMessage,
  generateStudySchedule,
  detectWorkloadOverload,
  generateProductivityInsight,
};
