const mongoose = require('mongoose');
const { APP_SOURCES } = require('../constants/apps');

/**
 * One row per registered phone number. `phone` is globally unique: a number belongs
 * to exactly one app (the most recent registration wins).
 */
const smsUserSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true, index: true },
  appSource: { type: String, enum: APP_SOURCES, required: true },
  sessionState: { type: String, default: '' },
  sessionData: { type: mongoose.Schema.Types.Mixed, default: {} },
  optedOut: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('SmsUser', smsUserSchema);
