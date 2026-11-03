const express = require('express');
const router = express.Router();
const { requireAppKey } = require('../middleware/routerApiKey');
const { asyncHandler } = require('../utils/asyncHandler');
const SmsUser = require('../models/SmsUser');
const { normalizePhone } = require('../utils/phone');

/** POST /register — an app claims a phone number. */
router.post('/register', requireAppKey, asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (!phone) return res.status(400).json({ error: 'Valid phone is required' });

  const existing = await SmsUser.findOne({ phone }).lean();
  if (existing && existing.appSource !== req.appSource) {
    return res.status(409).json({ ok: false, error: 'owned_by_other_app', message: 'This number is registered to a different app' });
  }

  const set = { phone, appSource: req.appSource };
  if (req.body.sessionState !== undefined) set.sessionState = String(req.body.sessionState);
  if (req.body.sessionData !== undefined) set.sessionData = req.body.sessionData;

  const user = await SmsUser.findOneAndUpdate(
    { phone },
    { $set: set, $setOnInsert: { optedOut: false } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.json({ ok: true, phone: user.phone, appSource: user.appSource });
}));

/** DELETE /unregister — an app releases a phone number it owns. */
router.delete('/unregister', requireAppKey, asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (!phone) return res.status(400).json({ error: 'Valid phone is required' });

  const r = await SmsUser.deleteOne({ phone, appSource: req.appSource });
  res.json({ ok: true, removed: r.deletedCount });
}));

module.exports = router;
