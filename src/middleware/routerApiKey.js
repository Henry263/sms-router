const { APP_SOURCES, appKey } = require('../constants/apps');
const { safeEqual } = require('../utils/safeEqual');

/**
 * Authenticate an app-to-router call. The app sends its `appSource` in the body and
 * its shared secret in the X-Router-API-Key header; both must match.
 */
function requireAppKey(req, res, next) {
  const appSource = req.body && req.body.appSource;
  if (!appSource || !APP_SOURCES.includes(appSource)) {
    return res.status(400).json({ error: 'appSource is required and must be a known app' });
  }
  const expected = appKey(appSource);
  const provided = req.get('X-Router-API-Key');
  if (!expected || !provided || !safeEqual(provided, expected)) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  req.appSource = appSource;
  return next();
}

module.exports = { requireAppKey };
