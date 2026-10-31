const path = require('path');
const dotenv = require('dotenv');
const { APPS } = require('../constants/apps');

/** Load .env and fail fast if anything required is missing. */
function loadEnv() {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });

  const required = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER', 'MONGODB_URI', 'PUBLIC_URL'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing required env: ${missing.join(', ')}`);

  const appKeyEnvs = Object.values(APPS).map((a) => a.apiKeyEnv);
  if (appKeyEnvs.every((k) => !process.env[k])) {
    throw new Error(`At least one app API key must be set (${appKeyEnvs.join(', ')})`);
  }
  for (const k of appKeyEnvs) {
    if (!process.env[k]) console.warn(`[sms-router] warning: ${k} not set; that app cannot authenticate`);
  }
  if (!process.env.TWILIO_MESSAGING_SERVICE_SID) {
    console.warn('[sms-router] warning: TWILIO_MESSAGING_SERVICE_SID not set; sending from the plain number (worse US deliverability).');
  }
}

module.exports = { loadEnv };
