require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const { initFirebase } = require('./config/firebase');

const whatsappRoutes = require('./routes/whatsapp');
const calendarRoutes = require('./routes/calendar');
const dashboardRoutes = require('./routes/dashboard');
const authRoutes = require('./routes/auth');
const reminderService = require('./services/reminderService');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Required for Twilio webhooks

// ── Init Firebase ─────────────────────────────────────────────
try {
  initFirebase();
} catch (err) {
  console.error("❌ Firebase init failed:", err.message);
}

// ── Routes ────────────────────────────────────────────────────
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/auth', authRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'CampusFlow', timestamp: new Date().toISOString() });
});

// ── Start reminder cron jobs ──────────────────────────────────
reminderService.startCronJobs();

// ── Error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

app.listen(PORT, () => {
  console.log(`🚀 CampusFlow backend running on http://localhost:${PORT}`);
  console.log(`📡 Twilio webhook: http://localhost:${PORT}/api/whatsapp/webhook`);
  console.log(`📊 Dashboard API: http://localhost:${PORT}/api/dashboard`);
});

module.exports = app;
