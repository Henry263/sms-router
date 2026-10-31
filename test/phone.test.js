const test = require('node:test');
const assert = require('node:assert');
const { normalizePhone } = require('../src/utils/phone');

test('normalizePhone forces E.164 (US default)', () => {
  assert.equal(normalizePhone('4084131602'), '+14084131602');
  assert.equal(normalizePhone('(408) 413-1602'), '+14084131602');
  assert.equal(normalizePhone('14084131602'), '+14084131602');
  assert.equal(normalizePhone('+1 408 413 1602'), '+14084131602');
});

test('normalizePhone returns null for empty input', () => {
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone(null), null);
});
