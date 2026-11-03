/**
 * Reference client for the SMS router. Copy this file into each app unchanged.
 * Node 18+ (global fetch), no dependencies.
 *
 *   const { createSmsRouterClient } = require('./smsRouterClient');
 *   const sms = createSmsRouterClient({
 *     baseUrl: process.env.SMS_ROUTER_URL,
 *     appSource: 'connectiko',                       // connectiko | scan4feedback | scan2reviews | scanmypro
 *     apiKey: process.env.ROUTER_API_KEY_CONNECTIKO
 *   });
 *   const r = await sms.sendSms({ to, body, messageType: 'contact_card', consent: { given: true, source: 'web_form' } });
 *   if (!r.ok) console.warn(r.error);                // never throws; branch on r.error
 *
 * Every method resolves to { ok, status, ...routerJson }. On a 4xx the router's { error, message }
 * is returned as-is. Network errors, timeouts and 5xx are retried (same idempotencyKey, so a retry
 * can never text twice); if they still fail you get { ok: false, status: 0|5xx, error: 'router_unavailable' }.
 *
 * Error codes you can branch on: consent_required, invalid_*, opted_out, owned_by_other_app,
 * rate_limited, send_failed, router_unavailable.
 */
const crypto = require('crypto');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function createSmsRouterClient({ baseUrl, appSource, apiKey, timeoutMs = 8000, retries = 2, backoffMs = 300, fetchImpl } = {}) {
  if (!baseUrl) throw new Error('smsRouterClient: baseUrl is required');
  if (!appSource) throw new Error('smsRouterClient: appSource is required');
  if (!apiKey) throw new Error('smsRouterClient: apiKey is required');
  const root = String(baseUrl).replace(/\/$/, '');
  const doFetch = fetchImpl || ((...args) => fetch(...args));

  async function call(method, path, payload) {
    const body = JSON.stringify({ ...payload, appSource });
    let last = { ok: false, status: 0, error: 'router_unavailable', message: 'SMS router unreachable' };

    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await sleep(backoffMs * 2 ** (attempt - 1));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await doFetch(`${root}${path}`, {
          method,
          headers: { 'Content-Type': 'application/json', 'X-Router-API-Key': apiKey },
          body,
          signal: controller.signal
        });
        let json = {};
        try { json = await res.json(); } catch (_) { /* non-JSON body */ }

        if (res.status >= 500) {
          last = { ...json, ok: false, status: res.status, error: json.error === 'send_failed' ? 'send_failed' : 'router_unavailable', message: json.message || `Router error ${res.status}` };
          // A Twilio rejection (502 send_failed) is retryable: the router lets the same key retry.
          continue;
        }
        return { ...json, ok: res.ok && json.ok !== false, status: res.status };
      } catch (err) {
        last = { ok: false, status: 0, error: 'router_unavailable', message: err.name === 'AbortError' ? 'SMS router timed out' : err.message };
      } finally {
        clearTimeout(timer);
      }
    }
    return last;
  }

  return {
    /** Send a text. Auto-generates an idempotencyKey so retries never duplicate. */
    sendSms({ to, body, messageType = 'other', consent, idempotencyKey } = {}) {
      return call('POST', '/send-sms', { to, body, messageType, consent, idempotencyKey: idempotencyKey || crypto.randomUUID() });
    },
    /** Text a verification code (the router stores only a hash). */
    sendOtp({ phone }) { return call('POST', '/send-otp', { phone }); },
    /** Check a code collected in-app. Resolves { status: 'verified' | 'invalid' | 'expired' | 'locked' | 'no_session' }. */
    verifyOtp({ phone, code }) { return call('POST', '/verify-otp', { phone, code }); },
    /** Claim a phone number for this app so replies route back here. 409 owned_by_other_app if taken. */
    register({ phone, sessionState, sessionData }) { return call('POST', '/register', { phone, sessionState, sessionData }); },
    /** Release a number this app owns (e.g. when a user deletes their account). */
    unregister({ phone }) { return call('DELETE', '/unregister', { phone }); }
  };
}

/**
 * Verify the router's call to your /internal/sms endpoint (constant-time).
 * Pass req.get('X-Router-API-Key') and this app's key.
 */
function verifyRouterKey(provided, expected) {
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { createSmsRouterClient, verifyRouterKey };
