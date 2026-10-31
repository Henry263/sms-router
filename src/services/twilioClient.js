let client = null;

// In dry-run (SMS_DRY_RUN=true) no real SMS is sent; messages are recorded here for tests.
const sent = [];

function getClient() {
  if (!client) {
    const twilio = require('twilio');
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return client;
}

/** Send an SMS, preferring the A2P Messaging Service when configured. */
async function sendSms({ to, body }) {
  if (process.env.SMS_DRY_RUN === 'true') {
    const msg = { to, body, sid: `DRYRUN-${Date.now()}` };
    sent.push(msg);
    console.log(`[sms-router] DRY RUN → ${to}: ${body}`);
    return msg;
  }
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  return getClient().messages.create({
    to,
    body,
    ...(messagingServiceSid ? { messagingServiceSid } : { from: process.env.TWILIO_PHONE_NUMBER })
  });
}

module.exports = { sendSms, getClient, sent };
