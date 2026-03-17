<<<<<<< HEAD
# 🎓 CampusFlow — AI Student Productivity Platform

> **Hackathon project** — WhatsApp + AI + Google Calendar + n8n automation

---

## 🏗 Architecture

```
Student WhatsApp
     │
     ▼
Twilio Sandbox Webhook
     │
     ▼
Express Backend (Node.js)
     ├─→ Groq AI (Llama3) — parse message
     ├─→ Google Calendar API — create event
     ├─→ Firebase Firestore — store event
     └─→ n8n Webhook — schedule reminder
              │
              ▼
         Wait Node (delay until reminder time)
              │
              ▼
         Twilio → WhatsApp reminder sent
```

---

## 📁 Project Structure

```
campusflow/
├── backend/
│   ├── server.js                  # Express entry point
│   ├── package.json
│   ├── .env.example               # Copy to .env and fill in
│   ├── config/
│   │   ├── firebase.js            # Firebase Admin SDK init
│   │   └── googleCalendar.js      # Google Calendar OAuth
│   ├── routes/
│   │   ├── whatsapp.js            # Twilio webhook + commands
│   │   ├── calendar.js            # Calendar CRUD endpoints
│   │   ├── dashboard.js           # Dashboard + AI insights
│   │   └── auth.js                # Google OAuth flow
│   └── services/
│       ├── aiService.js           # Groq AI prompts
│       ├── whatsappService.js     # Twilio message sending
│       ├── calendarService.js     # Google Calendar operations
│       ├── dbService.js           # Firebase Firestore CRUD
│       └── reminderService.js     # Cron job reminders
├── dashboard/
│   └── index.html                 # Frontend dashboard
└── n8n/
    └── campusflow-workflow.json   # Import into n8n
```

---

## 🚀 Setup Guide (Step by Step)

### Step 1 — Clone & Install

```bash
cd campusflow/backend
npm install
cp .env.example .env
```

---

### Step 2 — Get API Keys

#### 🤖 Groq AI (free, fast)
1. Go to https://console.groq.com
2. Create API key
3. Add to `.env`: `GROQ_API_KEY=gsk_...`

#### 📱 Twilio WhatsApp Sandbox
1. Sign up at https://twilio.com (free trial)
2. Go to **Messaging → Try it out → Send a WhatsApp Message**
3. Follow sandbox join instructions (send "join [word]" to +1 415 523 8886)
4. Add to `.env`:
   - `TWILIO_ACCOUNT_SID=AC...`
   - `TWILIO_AUTH_TOKEN=...`
5. Set webhook URL in Twilio Console:
   - **A Message Comes In** → `https://your-ngrok-url/api/whatsapp/webhook`

#### 🔥 Firebase Firestore
1. Create project at https://console.firebase.google.com
2. Enable **Firestore** (Native mode)
3. Go to **Project Settings → Service Accounts → Generate new private key**
4. Download JSON, copy values to `.env`
5. Create these Firestore indexes (or they auto-create on first run):
   - `events`: `phone ASC, status ASC, date ASC`
   - `events`: `status ASC, date ASC`

#### 📅 Google Calendar API
1. Go to https://console.cloud.google.com
2. Create new project → Enable **Google Calendar API**
3. Go to **APIs & Services → Credentials → Create OAuth 2.0 Client ID**
   - Type: **Web application**
   - Redirect URI: `http://localhost:3000/api/auth/google/callback`
4. Add Client ID and Secret to `.env`
5. **Get your refresh token:**
   ```bash
   npm start
   # Open: http://localhost:3000/api/auth/google
   # Authorize → copy GOOGLE_REFRESH_TOKEN from page
   # Add to .env
   ```

---

### Step 3 — Run the Backend

```bash
# Expose local server to internet (Twilio needs this)
npx ngrok http 3000

# In another terminal:
cd backend
npm run dev
```

Set your ngrok URL as the Twilio webhook:
`https://xxxx.ngrok.io/api/whatsapp/webhook`

---

### Step 4 — Setup n8n

```bash
# Install n8n globally
npm install -g n8n

# Start n8n
n8n start
# Open http://localhost:5678
```

1. Go to **Workflows → Import from file**
2. Import `n8n/campusflow-workflow.json`
3. Set environment variable in n8n:
   - `CAMPUSFLOW_API` = `http://localhost:3000`
4. Activate the workflow
5. Copy webhook URL (e.g. `http://localhost:5678/webhook/campusflow`)
6. Add to `.env`: `N8N_WEBHOOK_URL=http://localhost:5678/webhook/campusflow`

---

### Step 5 — Open the Dashboard

Open `dashboard/index.html` in your browser.
Or serve it: `npx serve dashboard -p 8080`

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/whatsapp/webhook` | Twilio WhatsApp webhook |
| POST | `/api/whatsapp/send` | Send WhatsApp message manually |
| GET  | `/api/dashboard` | Dashboard stats + events |
| GET  | `/api/dashboard/insights` | AI workload + study schedule |
| GET  | `/api/dashboard/events/:phone` | Events for a student |
| GET  | `/api/calendar/events` | List Google Calendar events |
| POST | `/api/calendar/events` | Create calendar event |
| GET  | `/api/auth/google` | Start Google OAuth |
| GET  | `/health` | Health check |

---

## 💬 WhatsApp Commands

| Message | Action |
|---------|--------|
| `Reminder: [task] at [time]` | Create event + calendar entry |
| `[task] tomorrow at [time]` | Create event |
| `status` | List your upcoming events |
| `schedule` | Get AI study schedule |
| `help` | Show all commands |

---

## 🤖 AI Prompt (Groq Llama3)

The system prompt for event extraction:

```
You are an AI assistant for CampusFlow.
Extract calendar event details from natural student messages.
Today's date is {today}.
Return ONLY valid JSON with: hasEvent, title, date, time, 
duration, description, priority, category, reminderMinutes.
```

---

## 🔄 n8n Workflow Nodes

1. **Webhook Trigger** — Receives event data from backend
2. **Code Node** — Parses payload, creates reminder schedule
3. **Wait Node** — Delays until X minutes before event
4. **HTTP Request** — Calls `/api/whatsapp/send` to send reminder
5. **HTTP Request** — Updates Firebase reminder status
6. **Code Node** — Logs success

---

## 🧪 Testing

```bash
# Test webhook manually (simulate WhatsApp message)
curl -X POST http://localhost:3000/api/whatsapp/webhook \
  -d "Body=Reminder: Math exam tomorrow at 10 AM" \
  -d "From=whatsapp:+919876543210"

# Test dashboard API
curl http://localhost:3000/api/dashboard

# Test insights
curl http://localhost:3000/api/dashboard/insights

# Health check
curl http://localhost:3000/health
```

---

## 🏆 Hackathon Demo Flow

1. Open dashboard → show live stats
2. Send WhatsApp: *"Reminder: AI assignment submission tomorrow at 5 PM"*
3. Show AI parsing in terminal logs
4. Show Google Calendar event created automatically
5. Show WhatsApp confirmation received
6. Show n8n workflow triggered in n8n UI
7. Show Firebase Firestore entry created
8. Show AI insights on dashboard

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| AI | Groq API (Llama3-8b) |
| Messaging | Twilio WhatsApp Sandbox |
| Calendar | Google Calendar API |
| Database | Firebase Firestore |
| Automation | n8n |
| Frontend | Vanilla HTML/CSS/JS |
| Tunnel | ngrok |
=======
# CampusFlow
>>>>>>> 684064d5453e81e0cb75e393ea76301fbb647349
