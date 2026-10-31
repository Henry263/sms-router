// appSource -> internal endpoint + which env var holds that app's shared API key.
// Internal URLs can be overridden per-environment with INTERNAL_URL_<APP> (e.g. for staging).
const APPS = {
  connectiko:    { internalUrl: 'https://connectiko.io/internal/sms',    apiKeyEnv: 'ROUTER_API_KEY_CONNECTIKO' },
  scan4feedback: { internalUrl: 'https://scan4feedback.com/internal/sms', apiKeyEnv: 'ROUTER_API_KEY_SCAN4FEEDBACK' },
  scan2reviews:  { internalUrl: 'https://scan2reviews.us/internal/sms',   apiKeyEnv: 'ROUTER_API_KEY_SCAN2REVIEWS' },
  scanmypro:     { internalUrl: 'https://scanmypro.com/internal/sms',     apiKeyEnv: 'ROUTER_API_KEY_SCANMYPRO' }
};

const APP_SOURCES = Object.keys(APPS);

function internalUrl(appSource) {
  const override = process.env[`INTERNAL_URL_${String(appSource).toUpperCase()}`];
  return override || (APPS[appSource] && APPS[appSource].internalUrl);
}

function appKey(appSource) {
  const a = APPS[appSource];
  return a ? process.env[a.apiKeyEnv] : undefined;
}

module.exports = { APPS, APP_SOURCES, internalUrl, appKey };
