/**
 * Validate Twilio's X-Twilio-Signature so only genuine Twilio requests reach /webhook.
 * Set SKIP_TWILIO_SIGNATURE=true for local testing with curl.
 */
function validateTwilioSignature(req, res, next) {
  if (process.env.SKIP_TWILIO_SIGNATURE === 'true') return next();
  try {
    const twilio = require('twilio');
    const signature = req.get('X-Twilio-Signature');
    const url = `${String(process.env.PUBLIC_URL || '').replace(/\/$/, '')}${req.originalUrl}`;
    const valid = signature && twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, signature, url, req.body || {});
    if (!valid) return res.status(403).send('Invalid Twilio signature');
    return next();
  } catch (err) {
    console.error('[sms-router] signature validation error:', err.message);
    return res.status(403).send('Signature validation error');
  }
}

module.exports = { validateTwilioSignature };
