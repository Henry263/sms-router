const { SendError } = require('../utils/errors');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof SendError) {
    return res.status(err.status).json({ ok: false, error: err.code, message: err.message });
  }
  console.error('[sms-router] error:', err.message);
  res.status(err.status || 500).json({ ok: false, error: 'internal_error', message: 'Internal error' });
}

module.exports = { errorHandler };
