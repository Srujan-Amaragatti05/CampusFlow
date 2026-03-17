const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MOOD_RESPONSES = {
  exhausted:  { emoji: '😴', color: 'blue',   label: 'Exhausted' },
  stressed:   { emoji: '😰', color: 'red',    label: 'Stressed' },
  motivated:  { emoji: '💪', color: 'green',  label: 'Motivated' },
  happy:      { emoji: '😊', color: 'yellow', label: 'Happy' },
  anxious:    { emoji: '😟', color: 'orange', label: 'Anxious' },
  focused:    { emoji: '🎯', color: 'teal',   label: 'Focused' },
  neutral:    { emoji: '😐', color: 'gray',   label: 'Neutral' },
};

// ─────────────────────────────────────────────────────────────
// Detect mood from message and return adapted schedule
// ─────────────────────────────────────────────────────────────
async function detectMoodAndAdapt(message, upcomingTasks) {
  const taskList = upcomingTasks
    .slice(0, 5)
    .map(t => `${t.title} (${t.date} ${t.time}, priority: ${t.priority})`)
    .join('\n');

  const res = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL || 'llama3-8b-8192',
    messages: [{
      role: 'system',
      content: `You are an empathetic AI study coach. Detect the student's mood and adapt their study plan.
Return ONLY valid JSON:
{
  "mood": "exhausted | stressed | motivated | happy | anxious | focused | neutral",
  "moodScore": 0-10,
  "empathyMessage": "short empathetic response",
  "adaptedPlan": "personalized 3-step action plan based on mood",
  "shouldReschedule": true/false,
  "breakRecommendation": "specific break suggestion if needed"
}`
    }, {
      role: 'user',
      content: `Student said: "${message}"\n\nTheir upcoming tasks:\n${taskList}\n\nDetect mood and create adapted plan.`
    }],
    temperature: 0.5, max_tokens: 500,
  });

  try {
    const raw = res.choices[0].message.content;
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : null;
    if (parsed) {
      parsed.moodInfo = MOOD_RESPONSES[parsed.mood] || MOOD_RESPONSES.neutral;
    }
    return parsed;
  } catch {
    return {
      mood: 'neutral',
      moodScore: 5,
      empathyMessage: "I hear you! Let's take it one step at a time.",
      adaptedPlan: "1. Take a 10-min break\n2. Start with the easiest task\n3. Reward yourself after each task",
      shouldReschedule: false,
      breakRecommendation: "Try a 5-minute walk",
      moodInfo: MOOD_RESPONSES.neutral,
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Check if message is a mood expression (not an event)
// ─────────────────────────────────────────────────────────────
function isMoodMessage(message) {
  const moodKeywords = [
    'tired', 'exhausted', 'stressed', 'overwhelmed', 'anxious', 'worried',
    'happy', 'motivated', 'excited', 'nervous', 'scared', 'burned out',
    'burnout', 'cant focus', "can't focus", 'feeling', 'mood', 'help me',
    'so much work', 'too much', 'i give up', 'frustrated', 'panic'
  ];
  const lower = message.toLowerCase();
  return moodKeywords.some(k => lower.includes(k));
}

function formatMoodResponse(analysis) {
  const { moodInfo, empathyMessage, adaptedPlan, breakRecommendation } = analysis;
  return `${moodInfo.emoji} *Mood Detected: ${moodInfo.label}*\n\n` +
    `💬 ${empathyMessage}\n\n` +
    `📋 *Your Adapted Plan:*\n${adaptedPlan}\n\n` +
    (breakRecommendation ? `☕ *Break tip:* ${breakRecommendation}\n\n` : '') +
    `_CampusFlow AI cares about you_ 🤍`;
}

module.exports = { detectMoodAndAdapt, isMoodMessage, formatMoodResponse };
