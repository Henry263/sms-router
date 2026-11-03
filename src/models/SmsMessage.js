const mongoose = require('mongoose');
const { APP_SOURCES } = require('../constants/apps');

/** Outbound message log: audit trail, rate-limit counting, delivery status, idempotency. */
const smsMessageSchema = new mongoose.Schema({
  appSource: { type: String, enum: APP_SOURCES, required: true },
  to: { type: String, required: true },
  // OTP bodies are stored redacted so verification codes never sit in the database.
  body: { type: String, default: '' },
  messageType: { type: String, enum: ['otp', 'contact_card', 'notification', 'reminder', 'marketing', 'other'], default: 'other' },
  sid: { type: String },
  status: { type: String, default: 'sending' },
  errorCode: { type: String },
  error: { type: String },
  idempotencyKey: { type: String },
  consent: {
    given: { type: Boolean },
    source: { type: String }
  }
}, { timestamps: true });

smsMessageSchema.index({ to: 1, createdAt: -1 });
smsMessageSchema.index({ appSource: 1, createdAt: -1 });
smsMessageSchema.index({ sid: 1 }, { sparse: true });
smsMessageSchema.index(
  { appSource: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

module.exports = mongoose.model('SmsMessage', smsMessageSchema);
