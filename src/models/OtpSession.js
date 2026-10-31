const mongoose = require('mongoose');
const { APP_SOURCES } = require('../constants/apps');

/**
 * A pending OTP for a phone. The code is stored only as a bcrypt hash. Mongo's TTL
 * index on `expiresAt` deletes expired sessions automatically (no cleanup job).
 */
const otpSessionSchema = new mongoose.Schema({
  phone: { type: String, required: true, index: true },
  codeHash: { type: String, required: true },
  appSource: { type: String, enum: APP_SOURCES, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });

otpSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OtpSession', otpSessionSchema);
