const test = require('node:test');
const assert = require('node:assert');
const { classify } = require('../src/services/keywords');

test('classify recognises STOP variants', () => {
  assert.equal(classify('STOP'), 'stop');
  assert.equal(classify(' stop '), 'stop');
  assert.equal(classify('Unsubscribe'), 'stop');
  assert.equal(classify('CANCEL'), 'stop');
});

test('classify recognises START and HELP', () => {
  assert.equal(classify('START'), 'start');
  assert.equal(classify('YES'), 'start');
  assert.equal(classify('HELP'), 'help');
  assert.equal(classify('INFO'), 'help');
});

test('classify returns null for normal text', () => {
  assert.equal(classify('hello there'), null);
  assert.equal(classify('123456'), null);
  assert.equal(classify(''), null);
});
