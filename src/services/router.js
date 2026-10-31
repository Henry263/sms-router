const SmsUser = require('../models/SmsUser');
const { classify, HELP_TEXT, STOP_TEXT, START_TEXT } = require('./keywords');
const { hasActiveOtp, verifyOtp } = require('./otpService');
const { forwardToApp } = require('./appForwarder');
const { normalizePhone } = require('../utils/phone');

const DEFAULT_REPLY = 'Thanks for your message. For help, reply HELP.';

/**
 * Core routing decision for an inbound SMS. Priority:
 *   1. STOP / START / HELP  (compliance always wins)
 *   2. a pending OTP code    (before any app routing)
 *   3. the app that owns the number
 *   4. default help reply    (unknown sender)
 * Returns { reply } — an empty reply means "acknowledge silently".
 */
async function handleInbound({ from, body }) {
  const phone = normalizePhone(from);
  if (!phone) return { reply: '' };
  const text = String(body || '').trim();

  const kw = classify(text);
  if (kw === 'stop') { await SmsUser.updateMany({ phone }, { $set: { optedOut: true } }); return { reply: STOP_TEXT }; }
  if (kw === 'start') { await SmsUser.updateMany({ phone }, { $set: { optedOut: false } }); return { reply: START_TEXT }; }
  if (kw === 'help') { return { reply: HELP_TEXT }; }

  const codeLike = text.replace(/\s/g, '');
  if (/^\d{4,8}$/.test(codeLike) && (await hasActiveOtp(phone))) {
    const r = await verifyOtp(phone, codeLike);
    if (r.status === 'verified') return { reply: 'Your number is verified. Thank you!' };
    if (r.status === 'invalid') return { reply: `That code is not correct. ${r.remaining} attempt(s) left.` };
    if (r.status === 'expired') return { reply: 'That code has expired. Please request a new one.' };
    if (r.status === 'locked') return { reply: 'Too many attempts. Please request a new code.' };
  }

  const user = await SmsUser.findOne({ phone });
  if (user && !user.optedOut) {
    try {
      const out = await forwardToApp(user.appSource, {
        phone,
        body: text,
        appSource: user.appSource,
        sessionState: user.sessionState,
        sessionData: user.sessionData
      });
      const set = {};
      if (out.sessionState !== undefined) set.sessionState = out.sessionState;
      if (out.sessionData !== undefined) set.sessionData = out.sessionData;
      if (Object.keys(set).length) await SmsUser.updateOne({ phone }, { $set: set });
      return { reply: out.reply || '' };
    } catch (err) {
      console.error(`[sms-router] forward to ${user.appSource} failed:`, err.message);
      return { reply: 'Sorry, we could not process that right now. Please try again later.' };
    }
  }

  return { reply: DEFAULT_REPLY };
}

module.exports = { handleInbound, DEFAULT_REPLY };
