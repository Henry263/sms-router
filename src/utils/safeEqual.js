const crypto = require('crypto');

/** Constant-time string compare that never throws on length mismatch. */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

module.exports = { safeEqual };
