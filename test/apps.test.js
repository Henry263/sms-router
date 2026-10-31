const test = require('node:test');
const assert = require('node:assert');
const { APP_SOURCES, internalUrl, appKey } = require('../src/constants/apps');

test('the four apps are registered', () => {
  assert.deepEqual(APP_SOURCES, ['connectiko', 'scan4feedback', 'scan2reviews', 'scanmypro']);
});

test('internalUrl resolves and honours env overrides', () => {
  assert.equal(internalUrl('scanmypro'), 'https://scanmypro.com/internal/sms');
  process.env.INTERNAL_URL_CONNECTIKO = 'https://stage.connectiko.io/internal/sms';
  assert.equal(internalUrl('connectiko'), 'https://stage.connectiko.io/internal/sms');
  delete process.env.INTERNAL_URL_CONNECTIKO;
});

test('appKey reads the per-app env var', () => {
  process.env.ROUTER_API_KEY_SCAN2REVIEWS = 'secret123';
  assert.equal(appKey('scan2reviews'), 'secret123');
  delete process.env.ROUTER_API_KEY_SCAN2REVIEWS;
});
