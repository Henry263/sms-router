const express = require('express');
const router = express.Router();
const { requireAppKey } = require('../middleware/routerApiKey');
const { sendOtp, verifyOtp } = require('../services/otpService');
const { normalizePhone } = require('../utils/phone');

/** POST /send-otp — generate and text a verification code for a phone. */
router.post('/send-otp', requireAppKey, async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (!phone) return res.status(400).json({ error: 'Valid phone is required' });
  await sendOtp(phone, req.appSource);
  res.json({ ok: true });
});

/**
 * POST /verify-otp — for apps that collect the code in-app (not via SMS reply).
 * Codes replied by SMS are verified in /webhook instead.
 */
router.post('/verify-otp', requireAppKey, async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const code = String(req.body.code || '');
  if (!phone || !code) return res.status(400).json({ error: 'phone and code are required' });
  const result = await verifyOtp(phone, code);
  res.json(result);
});

module.exports = router;
