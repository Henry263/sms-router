const test = require('node:test');
const assert = require('node:assert');
const { safeEqual } = require('../src/utils/safeEqual');
const { generateCode } = require('../src/services/otpService');

test('safeEqual compares correctly', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
  assert.equal(safeEqual('', ''), true);
});

test('generateCode returns a 6-digit string', () => {
  for (let i = 0; i < 50; i++) assert.match(generateCode(), /^\d{6}$/);
});
