const test = require('node:test');
const assert = require('node:assert');
const { createSmsRouterClient, verifyRouterKey } = require('../client/smsRouterClient');

// A fake fetch that replays scripted responses and records the requests.
function fakeFetch(script) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts, body: JSON.parse(opts.body) });
    const step = script.shift();
    if (step instanceof Error) throw step;
    return { status: step.status, ok: step.status >= 200 && step.status < 300, json: async () => step.json };
  };
  fn.calls = calls;
  return fn;
}
const make = (script, extra = {}) => {
  const f = fakeFetch(script);
  const client = createSmsRouterClient({ baseUrl: 'https://router.test/', appSource: 'connectiko', apiKey: 'k1', backoffMs: 1, fetchImpl: f, ...extra });
  return { client, f };
};
const consent = { given: true, source: 'web_form' };

test('sendSms posts to /send-sms with the key, appSource and an auto idempotencyKey', async () => {
  const { client, f } = make([{ status: 200, json: { ok: true, sid: 'SM1', status: 'queued' } }]);
  const r = await client.sendSms({ to: '+14155550123', body: 'hi', messageType: 'contact_card', consent });
  assert.equal(r.ok, true);
  assert.equal(r.sid, 'SM1');
  assert.equal(f.calls[0].url, 'https://router.test/send-sms');
  assert.equal(f.calls[0].opts.headers['X-Router-API-Key'], 'k1');
  assert.equal(f.calls[0].body.appSource, 'connectiko');
  assert.match(f.calls[0].body.idempotencyKey, /^[0-9a-f-]{36}$/);
});

test('a 5xx is retried with the SAME idempotencyKey, then succeeds', async () => {
  const { client, f } = make([{ status: 503, json: {} }, { status: 200, json: { ok: true, sid: 'SM2' } }]);
  const r = await client.sendSms({ to: '+14155550123', body: 'hi', consent });
  assert.equal(r.ok, true);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].body.idempotencyKey, f.calls[1].body.idempotencyKey);
});

test('a network error is retried, then reported as router_unavailable (never throws)', async () => {
  const { client, f } = make([new Error('ECONNREFUSED'), new Error('ECONNREFUSED'), new Error('ECONNREFUSED')]);
  const r = await client.sendSms({ to: '+14155550123', body: 'hi', consent });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'router_unavailable');
  assert.equal(f.calls.length, 3);
});

test('a 4xx is NOT retried and the router error is passed through', async () => {
  const { client, f } = make([{ status: 403, json: { ok: false, error: 'opted_out', message: 'no' } }]);
  const r = await client.sendSms({ to: '+14155550123', body: 'hi', consent });
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
  assert.equal(r.error, 'opted_out');
  assert.equal(f.calls.length, 1);
});

test('a Twilio rejection (502 send_failed) is retried and keeps its error code if it keeps failing', async () => {
  const { client, f } = make([{ status: 502, json: { error: 'send_failed' } }, { status: 502, json: { error: 'send_failed' } }, { status: 502, json: { error: 'send_failed' } }]);
  const r = await client.sendSms({ to: '+14155550123', body: 'hi', consent });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'send_failed');
  assert.equal(f.calls.length, 3);
});

test('unregister uses DELETE and register/otp hit the right paths', async () => {
  const { client, f } = make([{ status: 200, json: { ok: true } }, { status: 200, json: { ok: true } }, { status: 200, json: { ok: true } }, { status: 200, json: { status: 'verified' } }]);
  await client.unregister({ phone: '+14155550123' });
  await client.register({ phone: '+14155550123' });
  await client.sendOtp({ phone: '+14155550123' });
  await client.verifyOtp({ phone: '+14155550123', code: '123456' });
  assert.deepEqual(f.calls.map((c) => [c.opts.method, c.url.replace('https://router.test', '')]),
    [['DELETE', '/unregister'], ['POST', '/register'], ['POST', '/send-otp'], ['POST', '/verify-otp']]);
});

test('required options are enforced', () => {
  assert.throws(() => createSmsRouterClient({ appSource: 'a', apiKey: 'k' }), /baseUrl/);
  assert.throws(() => createSmsRouterClient({ baseUrl: 'x', apiKey: 'k' }), /appSource/);
  assert.throws(() => createSmsRouterClient({ baseUrl: 'x', appSource: 'a' }), /apiKey/);
});

test('verifyRouterKey is exact and rejects empty values', () => {
  assert.equal(verifyRouterKey('abc', 'abc'), true);
  assert.equal(verifyRouterKey('abc', 'abd'), false);
  assert.equal(verifyRouterKey('', ''), false);
  assert.equal(verifyRouterKey(undefined, 'abc'), false);
  assert.equal(verifyRouterKey('abc', undefined), false);
});
