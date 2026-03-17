const express = require('express');
const router = express.Router();
const { getAuthUrl, getOAuth2Client } = require('../config/googleCalendar');

// Step 1: Visit this URL to authorize your Google Account
// GET /api/auth/google
router.get('/google', (req, res) => {
  const url = getAuthUrl();
  console.log('🔐 Google Auth URL:', url);
  res.redirect(url);
});

// Step 2: Google redirects here with a code
// GET /api/auth/google/callback
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code parameter');

  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    // IMPORTANT: Copy this refresh_token into your .env file!
    console.log('✅ Google tokens received:');
    console.log('GOOGLE_REFRESH_TOKEN=', tokens.refresh_token);

    res.send(`
      <h2>✅ Google Calendar Connected!</h2>
      <p>Copy this into your <code>.env</code> file:</p>
      <pre style="background:#f0f0f0;padding:12px;border-radius:6px">GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}</pre>
      <p>Then restart the server.</p>
    `);
  } catch (err) {
    res.status(500).send('OAuth error: ' + err.message);
  }
});

module.exports = router;
