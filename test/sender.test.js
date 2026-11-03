const test = require('node:test');
const assert = require('node:assert');
const { validateSendRequest, getLimits, MAX_BODY } = require('../src/services/smsSender');
const { SendError } = require('../src/utils/errors');

const ok = { to: '(408) 413-1602', body: ' hello ', consent: { given: true, source: 'web_form' } };
const code = (fn) => { try { fn(); return null; } catch (e) { return e instanceof SendError ? e.code : 'other'; } };

test('a valid request is normalised', () => {
  const v = validateSendRequest(ok);
  assert.equal(v.to, '+14084131602');
  assert.equal(v.text, 'hello');
  assert.equal(v.messageType, 'other');
  assert.deepEqual(v.consent, { given: true, source: 'web_form' });
});

test('missing or bad phone is rejected', () => {
  assert.equal(code(() => validateSendRequest({ ...ok, to: '' })), 'invalid_phone');
  assert.equal(code(() => validateSendRequest({ ...ok, to: undefined })), 'invalid_phone');
});

test('empty or over-long body is rejected', () => {
  assert.equal(code(() => validateSendRequest({ ...ok, body: '   ' })), 'invalid_body');
  assert.equal(code(() => validateSendRequest({ ...ok, body: 'x'.repeat(MAX_BODY + 1) })), 'invalid_body');
  assert.equal(code(() => validateSendRequest({ ...ok, body: 'x'.repeat(MAX_BODY) })), null);
});

test('consent is mandatory and must say how it was obtained', () => {
  assert.equal(code(() => validateSendRequest({ ...ok, consent: undefined })), 'consent_required');
  assert.equal(code(() => validateSendRequest({ ...ok, consent: { given: false, source: 'x' } })), 'consent_required');
  assert.equal(code(() => validateSendRequest({ ...ok, consent: { given: true } })), 'consent_required');
  assert.equal(code(() => validateSendRequest({ ...ok, consent: { given: true, source: '  ' } })), 'consent_required');
});

test('messageType "otp" is reserved for /send-otp', () => {
  assert.equal(code(() => validateSendRequest({ ...ok, messageType: 'otp' })), 'invalid_message_type');
  assert.equal(code(() => validateSendRequest({ ...ok, messageType: 'contact_card' })), null);
});

test('idempotencyKey must be a non-empty string up to 100 chars', () => {
  assert.equal(code(() => validateSendRequest({ ...ok, idempotencyKey: '' })), 'invalid_idempotency_key');
  assert.equal(code(() => validateSendRequest({ ...ok, idempotencyKey: 'x'.repeat(101) })), 'invalid_idempotency_key');
  assert.equal(validateSendRequest({ ...ok, idempotencyKey: 'order-1' }).idempotencyKey, 'order-1');
});

test('default limits match the agreed policy and can be overridden by env', () => {
  delete process.env.SMS_MAX_PER_PHONE_PER_DAY;
  delete process.env.SMS_MAX_PER_APP_PER_DAY;
  delete process.env.SMS_OTP_MAX_PER_PHONE_PER_DAY;
  assert.deepEqual(getLimits(), { perPhone: 3, perApp: 500, otpPerPhone: 5 });
  process.env.SMS_MAX_PER_PHONE_PER_DAY = '10';
  assert.equal(getLimits().perPhone, 10);
  delete process.env.SMS_MAX_PER_PHONE_PER_DAY;
});
