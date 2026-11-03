/**
 * End-to-end smoke test against a local MongoDB. No real SMS is sent (SMS_DRY_RUN) and Twilio
 * signature checks are skipped. Uses a throwaway DB that is dropped at the end.
 *
 *   node scripts/smoke.js        (needs mongod on 127.0.0.1:27017)
 */
process.env.SMS_DRY_RUN = 'true';
process.env.SKIP_TWILIO_SIGNATURE = 'true';
process.env.ROUTER_API_KEY_CONNECTIKO = 'smoke-connectiko-key';
process.env.ROUTER_API_KEY_SCANMYPRO = 'smoke-scanmypro-key';
process.env.TWILIO_PHONE_NUMBER = '+14084131602';
process.env.SMS_MAX_PER_PHONE_PER_DAY = '2';
process.env.SMS_OTP_MAX_PER_PHONE_PER_DAY = '2';
process.env.SMS_MAX_PER_APP_PER_DAY = '500';

const MONGODB_URI = 'mongodb://127.0.0.1:27017/sms-router-smoke';
const KEY = process.env.ROUTER_API_KEY_CONNECTIKO;
const KEY_PRO = process.env.ROUTER_API_KEY_SCANMYPRO;
const BOT = process.env.TWILIO_PHONE_NUMBER;

const mongoose = require('mongoose');
const { connectDb } = require('../src/config/db');
const { createApp } = require('../src/app');
const twilioClient = require('../src/services/twilioClient');
const SmsUser = require('../src/models/SmsUser');
const SmsSuppression = require('../src/models/SmsSuppression');
const SmsMessage = require('../src/models/SmsMessage');

let fails = 0;
const check = (name, cond, extra) => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'} - ${name}${cond ? '' : '  -> ' + JSON.stringify(extra)}`);
};
const form = (obj) => new URLSearchParams(obj).toString();
const consent = { given: true, source: 'web_form' };

(async () => {
  await connectDb(MONGODB_URI);
  await mongoose.connection.db.dropDatabase();
  await Promise.all([SmsUser.init(), SmsSuppression.init(), SmsMessage.init()]);

  const server = createApp().listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, path, body, headers = {}) =>
    fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const asConnectiko = { 'X-Router-API-Key': KEY };
  const webhook = (fields) =>
    fetch(`${base}/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ To: BOT, ...fields }) });
  const text = (r) => r.text();

  /* ---------- register / webhook / OTP (inbound side) ---------- */
  const P = '+14155550123';
  check('register with wrong key -> 401', (await call('POST', '/register', { phone: P, appSource: 'connectiko' }, { 'X-Router-API-Key': 'nope' })).status === 401);
  check('register with correct key -> 200', (await call('POST', '/register', { phone: P, appSource: 'connectiko' }, asConnectiko)).status === 200);
  check('register same number from another app -> 409', (await call('POST', '/register', { phone: P, appSource: 'scanmypro' }, { 'X-Router-API-Key': KEY_PRO })).status === 409);
  check('HELP -> help text', (await text(await webhook({ From: P, Body: 'HELP' }))).includes('reply STOP to opt out'));

  twilioClient.sent.length = 0;
  const otp = await call('POST', '/send-otp', { phone: P, appSource: 'connectiko' }, asConnectiko);
  const code = (twilioClient.sent[0]?.body.match(/\b(\d{6})\b/) || [])[1];
  check('send-otp -> 200 and a code was "sent"', otp.status === 200 && !!code);
  check('wrong code -> not verified', !(await text(await webhook({ From: P, Body: '000000' }))).includes('verified'));
  check('correct code -> verified', (await text(await webhook({ From: P, Body: code || '000000' }))).includes('verified'));
  const otpRow = await SmsMessage.findOne({ to: P, messageType: 'otp' }).lean();
  check('OTP log row never stores the code', otpRow && otpRow.body === '[redacted]' && !JSON.stringify(otpRow).includes(code), otpRow);

  /* ---------- OTP daily cap (2/phone) ---------- */
  const O = '+14155550400';
  const o1 = await call('POST', '/send-otp', { phone: O, appSource: 'connectiko' }, asConnectiko);
  const o2 = await call('POST', '/send-otp', { phone: O, appSource: 'connectiko' }, asConnectiko);
  const o3 = await call('POST', '/send-otp', { phone: O, appSource: 'connectiko' }, asConnectiko);
  check('OTP: first two allowed, third -> 429', o1.status === 200 && o2.status === 200 && o3.status === 429, [o1.status, o2.status, o3.status]);

  /* ---------- /send-sms ---------- */
  const S = '+14155550200';
  const send = (extra = {}, headers = asConnectiko) =>
    call('POST', '/send-sms', { appSource: 'connectiko', to: S, body: 'Your card: https://example.com', messageType: 'contact_card', consent, ...extra }, headers);

  check('send-sms without consent -> 400 consent_required', await (async () => { const r = await send({ consent: undefined }); const j = await r.json(); return r.status === 400 && j.error === 'consent_required'; })());
  check('send-sms with wrong key -> 401', (await send({}, { 'X-Router-API-Key': 'nope' })).status === 401);
  check('send-sms rejects messageType "otp"', (await send({ messageType: 'otp' })).status === 400);
  check('send-sms rejects an over-long body', (await send({ body: 'x'.repeat(1601) })).status === 400);

  twilioClient.sent.length = 0;
  const r1 = await send({ idempotencyKey: 'order-1' });
  const j1 = await r1.json();
  check('send-sms ok -> sid + queued, one text "sent"', r1.status === 200 && j1.ok && !!j1.sid && twilioClient.sent.length === 1, j1);
  const owner = await SmsUser.findOne({ phone: S }).lean();
  check('send-sms auto-registers the recipient to the sending app', owner && owner.appSource === 'connectiko', owner);

  const r1b = await send({ idempotencyKey: 'order-1' });
  const j1b = await r1b.json();
  check('same idempotencyKey -> duplicate, same sid, nothing re-sent', j1b.duplicate === true && j1b.sid === j1.sid && twilioClient.sent.length === 1, j1b);

  const rOther = await call('POST', '/send-sms', { appSource: 'scanmypro', to: S, body: 'hi', consent }, { 'X-Router-API-Key': KEY_PRO });
  const jOther = await rOther.json();
  check('another app texting an owned number -> 409 owned_by_other_app', rOther.status === 409 && jOther.error === 'owned_by_other_app', jOther);

  const r2 = await send({ idempotencyKey: 'order-2' });
  const r3 = await send({ idempotencyKey: 'order-3' });
  const j3 = await r3.json();
  check('per-phone cap (2/day): 2nd ok, 3rd -> 429 rate_limited', r2.status === 200 && r3.status === 429 && j3.error === 'rate_limited', [r2.status, r3.status, j3]);

  /* ---------- per-app cap ---------- */
  const counted = await SmsMessage.countDocuments({ appSource: 'connectiko', status: { $ne: 'failed' } });
  process.env.SMS_MAX_PER_APP_PER_DAY = String(counted);
  const rApp = await send({ to: '+14155550500', idempotencyKey: 'app-cap' });
  check('per-app cap reached -> 429', rApp.status === 429, rApp.status);
  process.env.SMS_MAX_PER_APP_PER_DAY = '500';

  /* ---------- STOP / START, including numbers nobody registered ---------- */
  const U = '+14155550300';
  check('STOP from an unregistered number -> unsubscribe text', (await text(await webhook({ From: U, Body: 'STOP' }))).includes('unsubscribed'));
  check('STOP is stored in the global suppression list', !!(await SmsSuppression.findOne({ phone: U })));
  const rStop = await send({ to: U, idempotencyKey: 'to-stopped' });
  const jStop = await rStop.json();
  check('send-sms to an opted-out number -> 403 opted_out', rStop.status === 403 && jStop.error === 'opted_out', jStop);
  const oStop = await call('POST', '/send-otp', { phone: U, appSource: 'connectiko' }, asConnectiko);
  check('send-otp to an opted-out number -> 403', oStop.status === 403, oStop.status);
  await webhook({ From: U, Body: 'START' });
  check('START removes the suppression', !(await SmsSuppression.findOne({ phone: U })));
  const rBack = await send({ to: U, idempotencyKey: 'after-start' });
  check('send-sms works again after START', rBack.status === 200, rBack.status);

  const stopRegistered = await text(await webhook({ From: P, Body: 'STOP' }));
  const flagged = await SmsUser.findOne({ phone: P }).lean();
  check('STOP on a registered number also sets optedOut', stopRegistered.includes('unsubscribed') && flagged.optedOut === true, flagged);

  /* ---------- delivery status callbacks ---------- */
  const cb = (status) => fetch(`${base}/status-callback`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ MessageSid: j1.sid, MessageStatus: status }) });
  check('status callback -> 204', (await cb('delivered')).status === 204);
  check('status callback updates the message', (await SmsMessage.findOne({ sid: j1.sid }).lean()).status === 'delivered');
  await cb('sent');
  check('a late "sent" does not move a delivered message backwards', (await SmsMessage.findOne({ sid: j1.sid }).lean()).status === 'delivered');

  /* ---------- failed sends: 502, don't count toward limits, retryable with the same key ---------- */
  const F = '+14155550600';
  const failing = await call('POST', '/send-sms', { appSource: 'connectiko', to: F, body: 'hello [[fail]]', consent, idempotencyKey: 'retry-me' }, asConnectiko);
  const failJson = await failing.json();
  check('Twilio failure -> 502 send_failed', failing.status === 502 && failJson.error === 'send_failed', failJson);
  const failRow = await SmsMessage.findOne({ to: F }).lean();
  check('failed attempt is logged as failed', failRow && failRow.status === 'failed' && failRow.errorCode === '99999', failRow);
  const retry = await call('POST', '/send-sms', { appSource: 'connectiko', to: F, body: 'hello again', consent, idempotencyKey: 'retry-me' }, asConnectiko);
  const retryJson = await retry.json();
  check('retrying a failed send with the same key re-attempts it', retry.status === 200 && retryJson.ok && !retryJson.duplicate, retryJson);
  check('only one log row remains for that key', (await SmsMessage.countDocuments({ to: F })) === 1);

  server.close();
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
  console.log(fails === 0 ? '\nSMOKE OK' : `\n${fails} FAILED`);
  process.exit(fails ? 1 : 0);
})().catch(async (e) => {
  console.error('SMOKE ERROR:', e.stack || e.message);
  try { await mongoose.connection.db.dropDatabase(); await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
