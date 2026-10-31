const { loadEnv } = require('./config/env');
loadEnv();

const express = require('express');
const { connectDb } = require('./config/db');
const webhookRoute = require('./routes/webhook');
const registerRoute = require('./routes/register');
const otpRoute = require('./routes/otp');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Twilio posts form-encoded

app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
app.use(webhookRoute);
app.use(registerRoute);
app.use(otpRoute);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

connectDb(process.env.MONGODB_URI)
  .then(() => app.listen(PORT, () => console.log(`[sms-router] listening on ${PORT}`)))
  .catch((err) => {
    console.error('[sms-router] failed to start:', err.message);
    process.exit(1);
  });

module.exports = app;
