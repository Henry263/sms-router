/**
 * TEMPLATE: the endpoint each app exposes so the router can hand it inbound texts.
 * Copy into your app, adapt `handleInboundText`, and mount it (see the bottom of this file).
 *
 * The router calls this ONLY for a number registered to your app, after it has already handled
 * STOP/START/HELP and any pending OTP. Request (JSON, header X-Router-API-Key):
 *   { phone, body, appSource, sessionState, sessionData }
 * Respond 200 with:
 *   { reply: 'text to send back', sessionState?: string, sessionData?: object }
 * An empty/missing reply acknowledges silently.
 */
const express = require('express');
const { verifyRouterKey } = require('./smsRouterClient'); // the reference client, copied next to this file

const router = express.Router();

/** Your app's logic. Return the text to send back, or '' to stay silent. */
async function handleInboundText({ phone, body, sessionState, sessionData }) {
  // Example: a simple two-step conversation.
  if (sessionState === 'awaiting_rating') {
    const rating = parseInt(String(body).trim(), 10);
    if (rating >= 1 && rating <= 5) {
      // ...persist the rating for `phone` here...
      return { reply: 'Thanks for your feedback!', sessionState: '', sessionData: {} };
    }
    return { reply: 'Please reply with a number from 1 to 5.' };
  }
  return { reply: '' };
}

router.post('/', express.json(), async (req, res) => {
  if (!verifyRouterKey(req.get('X-Router-API-Key'), process.env.ROUTER_API_KEY_MYAPP)) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  try {
    const out = await handleInboundText(req.body || {});
    return res.json({ reply: out.reply || '', sessionState: out.sessionState, sessionData: out.sessionData });
  } catch (err) {
    console.error('[internal/sms] handler error:', err.message);
    // 200 + empty reply: never make the router think the app is down over one bad message.
    return res.json({ reply: '' });
  }
});

module.exports = router;

// Mount it where your web server actually forwards traffic to Node. The default the router uses is
// https://<app-domain>/internal/sms; if your proxy only forwards some paths, mount under one it forwards
// (e.g. /api/internal/sms or /webhooks/...) and set INTERNAL_URL_<APP> in the router's env to match:
//   app.use('/internal/sms', require('./routes/internalSms'));
