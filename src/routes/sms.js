const express = require('express');
const router = express.Router();
const { requireAppKey } = require('../middleware/routerApiKey');
const { validateTwilioSignature } = require('../middleware/twilioSignature');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendManaged, applyStatus } = require('../services/smsSender');

/**
 * POST /send-sms — an app sends a text through the shared number.
 * Body: { appSource, to, body, messageType?, idempotencyKey?, consent: { given: true, source } }
 */
router.post('/send-sms', requireAppKey, asyncHandler(async (req, res) => {
  const result = await sendManaged(req.appSource, req.body);
  res.json(result);
}));

/** POST /status-callback — Twilio delivery-status updates (signature-validated). */
router.post('/status-callback', validateTwilioSignature, asyncHandler(async (req, res) => {
  await applyStatus(req.body || {});
  res.sendStatus(204);
}));

module.exports = router;
