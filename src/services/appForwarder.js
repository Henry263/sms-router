const axios = require('axios');
const { internalUrl, appKey } = require('../constants/apps');

/**
 * Forward an inbound message to the owning app's internal endpoint. The app
 * authenticates the router via the shared X-Router-API-Key header and replies with
 * { reply, sessionState?, sessionData? }.
 */
async function forwardToApp(appSource, payload) {
  const url = internalUrl(appSource);
  const key = appKey(appSource);
  if (!url || !key) throw new Error(`App ${appSource} is not fully configured`);

  const res = await axios.post(url, payload, {
    headers: { 'Content-Type': 'application/json', 'X-Router-API-Key': key },
    timeout: 5000
  });
  const data = res.data || {};
  return {
    reply: typeof data.reply === 'string' ? data.reply : '',
    sessionState: data.sessionState,
    sessionData: data.sessionData
  };
}

module.exports = { forwardToApp };
