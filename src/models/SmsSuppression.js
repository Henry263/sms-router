const mongoose = require('mongoose');

/**
 * Global do-not-text list, keyed by phone. A STOP from ANY number lands here, whether or not
 * the number was ever registered to an app. Every send checks it first.
 */
const smsSuppressionSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true, index: true },
  reason: { type: String, default: 'stop' },
  source: { type: String, default: 'inbound' },
  suppressedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('SmsSuppression', smsSuppressionSchema);
