// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error('[sms-router] error:', err.message);
  res.status(err.status || 500).json({ error: 'Internal error' });
}

module.exports = { errorHandler };
