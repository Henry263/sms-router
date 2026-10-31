/**
 * End-to-end smoke test against a local MongoDB. No real SMS is sent (SMS_DRY_RUN),
 * and Twilio signature checks are skipped. Uses a throwaway DB that is dropped at the end.
 *
 *   node scripts/smoke.js        (needs mongod on 127.0.0.1:27017)
 */
process.env.SMS_DRY_RUN = 'true';
process.env.SKIP_TWILIO_SIGNATURE = 'true';
process.env.ROUTER_API_KEY_CONNECTIKO = process.env.ROUTER_API_KEY_CONNECTIKO || 'smoke-connectiko-key';
process.env.TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '+14084131602';

const MONGODB_URI = 'mongodb://127.0.0.1:27017/sms-router-smoke';
const PHONE = '+14155550123';
const KEY = process.env.ROUTER_API_KEY_CONNECTIKO;

const express = require('express');
const mongoose = require('mongoose');
const { connectDb } = require('../src/config/db');
const twilioClient = require('../src/services/twilioClient');

let fails = 0;
const check = (name, cond, extra) => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'} - ${name}${cond ? '' : '  -> ' + JSON.stringify(extra)}`);
};

const form = (obj) => new URLSearchParams(obj).toString();

(async () => {
  await connectDb(MONGODB_URI);
  await mongoose.connection.db.dropDatabase();

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(require('../src/routes/webhook'));
  app.use(require('../src/routes/register'));
  app.use(require('../src/routes/otp'));

  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  const postJson = (path, body, headers = {}) =>
    fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const del = (path, body, headers = {}) =>
    fetch(`${base}${path}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const webhook = (fields) =>
    fetch(`${base}/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(fields) });
  const twiml = async (r) => (await r.text());

  // 1. register (wrong key rejected, right key accepted)
  const bad = await postJson('/register', { phone: PHONE, appSource: 'connectiko' }, { 'X-Router-API-Key': 'nope' });
  check('register with wrong key → 401', bad.status === 401, bad.status);
  const reg = await postJson('/register', { phone: PHONE, appSource: 'connectiko' }, { 'X-Router-API-Key': KEY });
  check('register with correct key → 200', reg.status === 200, reg.status);

  // 2. HELP keyword
  const help = await webhook({ From: PHONE, To: process.env.TWILIO_PHONE_NUMBER, Body: 'HELP' });
  check('HELP → help text in TwiML', (await twiml(help)).includes('reply STOP to opt out'));

  // 3. OTP: send, read dry-run code, verify via SMS reply
  twilioClient.sent.length = 0;
  const otp = await postJson('/send-otp', { phone: PHONE, appSource: 'connectiko' }, { 'X-Router-API-Key': KEY });
  const code = (twilioClient.sent[0]?.body.match(/\b(\d{6})\b/) || [])[1];
  check('send-otp → 200 and a code was "sent"', otp.status === 200 && !!code, { status: otp.status, sent: twilioClient.sent[0]?.body });
  const wrong = await webhook({ From: PHONE, To: process.env.TWILIO_PHONE_NUMBER, Body: '000000' });
  check('wrong code → not verified', !(await twiml(wrong)).includes('verified'));
  const right = await webhook({ From: PHONE, To: process.env.TWILIO_PHONE_NUMBER, Body: code || '000000' });
  check('correct code → verified', (await twiml(right)).includes('verified'));

  // 4. STOP opts the number out
  const stop = await webhook({ From: PHONE, To: process.env.TWILIO_PHONE_NUMBER, Body: 'STOP' });
  check('STOP → unsubscribe text', (await twiml(stop)).includes('unsubscribed'));
  const SmsUser = require('../src/models/SmsUser');
  const after = await SmsUser.findOne({ phone: PHONE }).lean();
  check('STOP set optedOut=true', after && after.optedOut === true, after);

  // 5. unknown sender → default reply
  const unknown = await webhook({ From: '+14155559999', To: process.env.TWILIO_PHONE_NUMBER, Body: 'hi' });
  check('unknown sender → default reply', (await twiml(unknown)).includes('For help, reply HELP'));

  // 6. unregister
  const un = await del('/unregister', { phone: PHONE, appSource: 'connectiko' }, { 'X-Router-API-Key': KEY });
  const unBody = await un.json();
  check('unregister removes the row', un.status === 200 && unBody.removed === 1, unBody);

  server.close();
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
  console.log(fails === 0 ? '\nSMOKE OK' : `\n${fails} FAILED`);
  process.exit(fails ? 1 : 0);
})().catch(async (e) => {
  console.error('SMOKE ERROR:', e.message);
  try { await mongoose.connection.db.dropDatabase(); await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
