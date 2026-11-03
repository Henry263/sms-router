const express = require('express');
const webhookRoute = require('./routes/webhook');
const registerRoute = require('./routes/register');
const otpRoute = require('./routes/otp');
const smsRoute = require('./routes/sms');
const { errorHandler } = require('./middleware/errorHandler');

/** Build the Express app (no DB connection or listen); shared by the server and the smoke test. */
function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false })); // Twilio posts form-encoded

  app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
  app.use(webhookRoute);
  app.use(registerRoute);
  app.use(otpRoute);
  app.use(smsRoute);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
