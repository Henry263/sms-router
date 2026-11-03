const SmsUser = require('../models/SmsUser');
const SmsSuppression = require('../models/SmsSuppression');
const SmsMessage = require('../models/SmsMessage');
const { sendSms } = require('./twilioClient');
const { normalizePhone } = require('../utils/phone');
const { SendError } = require('../utils/errors');

// Read at call time so limits can be tuned (or changed in tests) without a restart of the module.
function getLimits() {
  const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);
  return {
    perPhone: int(process.env.SMS_MAX_PER_PHONE_PER_DAY, 3),
    perApp: int(process.env.SMS_MAX_PER_APP_PER_DAY, 500),
    otpPerPhone: int(process.env.SMS_OTP_MAX_PER_PHONE_PER_DAY, 5)
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_BODY = 1600;
const SEND_TYPES = ['contact_card', 'notification', 'reminder', 'marketing', 'other'];

/** Validate + normalise a /send-sms body. Throws SendError(400) on bad input. */
function validateSendRequest(input) {
  const b = input || {};
  const to = normalizePhone(b.to);
  if (!to || to.length < 8) throw new SendError('invalid_phone', 400, 'A valid "to" phone number is required');

  const text = typeof b.body === 'string' ? b.body.trim() : '';
  if (!text) throw new SendError('invalid_body', 400, '"body" is required');
  if (text.length > MAX_BODY) throw new SendError('invalid_body', 400, `"body" must be at most ${MAX_BODY} characters`);

  const messageType = b.messageType === undefined ? 'other' : b.messageType;
  if (!SEND_TYPES.includes(messageType)) {
    throw new SendError('invalid_message_type', 400, `messageType must be one of: ${SEND_TYPES.join(', ')} (use /send-otp for codes)`);
  }

  const c = b.consent;
  if (!c || c.given !== true || typeof c.source !== 'string' || !c.source.trim() || c.source.length > 100) {
    throw new SendError('consent_required', 400, 'consent.given must be true and consent.source must say how consent was obtained');
  }

  let idempotencyKey;
  if (b.idempotencyKey !== undefined) {
    if (typeof b.idempotencyKey !== 'string' || !b.idempotencyKey || b.idempotencyKey.length > 100) {
      throw new SendError('invalid_idempotency_key', 400, 'idempotencyKey must be a string up to 100 characters');
    }
    idempotencyKey = b.idempotencyKey;
  }

  return { to, text, messageType, idempotencyKey, consent: { given: true, source: c.source.trim() } };
}

async function isSuppressed(phone) {
  return !!(await SmsSuppression.exists({ phone }));
}

async function assertNotSuppressed(phone) {
  if (await isSuppressed(phone)) throw new SendError('opted_out', 403, 'Recipient has opted out of text messages');
}

/** Rolling-24h caps per phone and per app. Failed sends do not count. */
async function assertWithinLimits({ appSource, phone, otp }) {
  const L = getLimits();
  const since = new Date(Date.now() - DAY_MS);
  const base = { status: { $ne: 'failed' }, createdAt: { $gte: since } };

  if (otp) {
    const n = await SmsMessage.countDocuments({ ...base, to: phone, messageType: 'otp' });
    if (n >= L.otpPerPhone) throw new SendError('rate_limited', 429, 'Too many verification codes sent to this number today');
  } else {
    const n = await SmsMessage.countDocuments({ ...base, to: phone, messageType: { $ne: 'otp' } });
    if (n >= L.perPhone) throw new SendError('rate_limited', 429, 'Daily text limit for this number reached');
  }
  const appCount = await SmsMessage.countDocuments({ ...base, appSource });
  if (appCount >= L.perApp) throw new SendError('rate_limited', 429, 'Daily text limit for this app reached');
}

function toResult(m, duplicate = false) {
  return { ok: m.status !== 'failed', messageId: String(m._id), sid: m.sid || null, status: m.status, duplicate };
}

/**
 * Send one app-originated text. Order matters:
 * idempotency -> opt-out -> ownership -> limits -> log row (claims the idempotency key) -> Twilio.
 */
async function sendManaged(appSource, input) {
  const { to, text, messageType, idempotencyKey, consent } = validateSendRequest(input);

  if (idempotencyKey) {
    const existing = await SmsMessage.findOne({ appSource, idempotencyKey });
    if (existing) {
      if (existing.status !== 'failed') return toResult(existing, true);
      await existing.deleteOne(); // a failed attempt may be retried with the same key
    }
  }

  await assertNotSuppressed(to);

  // Ownership: a number belongs to one app. Claim it if free, refuse if another app has it.
  let owner = await SmsUser.findOne({ phone: to }).lean();
  if (!owner) {
    await SmsUser.updateOne({ phone: to }, { $setOnInsert: { phone: to, appSource, optedOut: false } }, { upsert: true });
    owner = await SmsUser.findOne({ phone: to }).lean();
  }
  if (owner.appSource !== appSource) {
    throw new SendError('owned_by_other_app', 409, 'This number is registered to a different app');
  }

  await assertWithinLimits({ appSource, phone: to, otp: false });

  let msg;
  try {
    msg = await SmsMessage.create({ appSource, to, body: text, messageType, idempotencyKey, consent, status: 'sending' });
  } catch (err) {
    if (err.code === 11000 && idempotencyKey) {
      const existing = await SmsMessage.findOne({ appSource, idempotencyKey });
      if (existing) return toResult(existing, true);
    }
    throw err;
  }

  return deliver(msg, { to, body: text });
}

/** Hand a logged message to Twilio and record the outcome. */
async function deliver(msg, { to, body }) {
  try {
    const r = await sendSms({ to, body });
    msg.sid = r.sid;
    msg.status = r.status || 'queued';
    await msg.save();
    return toResult(msg);
  } catch (err) {
    msg.status = 'failed';
    msg.error = String(err.message || 'send failed').slice(0, 300);
    if (err.code) msg.errorCode = String(err.code);
    await msg.save();
    console.error(`[sms-router] Twilio send failed (${msg.appSource}):`, msg.error);
    throw new SendError('send_failed', 502, 'The message could not be sent');
  }
}

// Status callbacks can arrive out of order; never move a message backwards.
const RANK = { sending: 1, queued: 2, accepted: 2, sent: 3, delivered: 4, undelivered: 4, failed: 4 };

/** Apply a Twilio status callback ({ MessageSid, MessageStatus, ErrorCode }). */
async function applyStatus({ MessageSid, MessageStatus, ErrorCode }) {
  const status = String(MessageStatus || '').toLowerCase();
  if (!MessageSid || !RANK[status]) return false;
  const msg = await SmsMessage.findOne({ sid: MessageSid });
  if (!msg) return false;
  if ((RANK[msg.status] || 0) > RANK[status]) return false;
  msg.status = status;
  if (ErrorCode) msg.errorCode = String(ErrorCode);
  await msg.save();
  return true;
}

module.exports = {
  getLimits, validateSendRequest, isSuppressed, assertNotSuppressed, assertWithinLimits,
  sendManaged, deliver, applyStatus, MAX_BODY, SEND_TYPES
};
