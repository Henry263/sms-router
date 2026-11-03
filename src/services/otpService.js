const bcrypt = require('bcryptjs');
const OtpSession = require('../models/OtpSession');
const SmsMessage = require('../models/SmsMessage');
const { assertNotSuppressed, assertWithinLimits, deliver } = require('./smsSender');

const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Create/replace the pending OTP for a phone and text the code. Honors opt-outs and daily caps. */
async function sendOtp(phone, appSource) {
  await assertNotSuppressed(phone);
  await assertWithinLimits({ appSource, phone, otp: true });

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  await OtpSession.findOneAndUpdate(
    { phone },
    { phone, codeHash, appSource, attempts: 0, expiresAt: new Date(Date.now() + TTL_MS) },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // The log row stores no code; only the text sent to Twilio contains it.
  const msg = await SmsMessage.create({ appSource, to: phone, body: '[redacted]', messageType: 'otp', status: 'sending' });
  await deliver(msg, { to: phone, body: `Your verification code is ${code}. It expires in 10 minutes.` });
  return { sent: true };
}

async function hasActiveOtp(phone) {
  const s = await OtpSession.findOne({ phone }).lean();
  return !!(s && s.expiresAt > new Date());
}

/** Verify a code. Deletes the session on success, expiry or lock-out. */
async function verifyOtp(phone, code) {
  const session = await OtpSession.findOne({ phone });
  if (!session) return { status: 'no_session' };
  if (session.expiresAt <= new Date()) { await session.deleteOne(); return { status: 'expired' }; }
  if (session.attempts >= MAX_ATTEMPTS) { await session.deleteOne(); return { status: 'locked' }; }

  const ok = await bcrypt.compare(String(code), session.codeHash);
  if (!ok) {
    session.attempts += 1;
    await session.save();
    return { status: 'invalid', remaining: Math.max(0, MAX_ATTEMPTS - session.attempts) };
  }

  const appSource = session.appSource;
  await session.deleteOne();
  return { status: 'verified', appSource };
}

module.exports = { sendOtp, verifyOtp, hasActiveOtp, generateCode, MAX_ATTEMPTS };
