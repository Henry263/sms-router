# SMS Router

Central inbound-SMS router for one shared Twilio number (`+14084131602`) used by several apps:
**connectiko**, **scan4feedback**, **scan2reviews**, **scanmypro**.

Twilio delivers every inbound SMS to this service. It looks the sender up in MongoDB, decides
which app the number belongs to, and forwards the message to that app's internal endpoint.
OTP verification and STOP/HELP/START are handled centrally here.

## Routing priority (`POST /webhook`)
1. **STOP / START / HELP** — compliance keywords, always handled.
2. **Pending OTP** — a numeric reply while a code is active is verified here.
3. **App lookup** — forward to the owning app's `/internal/sms`.
4. **Unknown sender** — default help reply.

## Endpoints
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/webhook` | Twilio signature | Twilio inbound SMS → TwiML |
| POST | `/register` | `X-Router-API-Key` | app claims a phone number |
| DELETE | `/unregister` | `X-Router-API-Key` | app releases a phone number |
| POST | `/send-otp` | `X-Router-API-Key` | text a verification code |
| POST | `/verify-otp` | `X-Router-API-Key` | verify a code collected in-app |
| POST | `/send-sms` | `X-Router-API-Key` | an app sends a text through the shared number |
| POST | `/status-callback` | Twilio signature | Twilio delivery-status updates |
| GET | `/health` | none | health check |

App-facing calls send `appSource` in the JSON body and that app's secret in the
`X-Router-API-Key` header.

## Sending a text from an app (`POST /send-sms`)
Header `X-Router-API-Key: <your app's key>`, JSON body:
```json
{ "appSource": "connectiko", "to": "+14155550123", "body": "Your card: https://...",
  "messageType": "contact_card", "idempotencyKey": "order-123",
  "consent": { "given": true, "source": "web_form" } }
```
`messageType` is one of `contact_card | notification | reminder | marketing | other`
(`otp` is reserved for `/send-otp`). Response: `{ ok, messageId, sid, status, duplicate }`.

The router refuses, in this order:
| Status | `error` | Meaning |
|---|---|---|
| 400 | `consent_required` / `invalid_*` | consent missing, or bad phone / body / type / key |
| 403 | `opted_out` | the number replied STOP (global list, works even if never registered) |
| 409 | `owned_by_other_app` | the number is registered to a different app |
| 429 | `rate_limited` | per-phone or per-app daily cap reached |
| 502 | `send_failed` | Twilio rejected it (the same `idempotencyKey` may be retried) |

Rules: a number belongs to one app (first to text or register it; `/send-sms` claims it automatically so
replies route back). The same `idempotencyKey` never sends twice. Failed sends do not count toward caps.
Caps are rolling 24h: `SMS_MAX_PER_PHONE_PER_DAY` (3), `SMS_MAX_PER_APP_PER_DAY` (500),
`SMS_OTP_MAX_PER_PHONE_PER_DAY` (5). Quiet hours are not enforced yet.

## The contract each app must implement (`POST /internal/sms`)
The router calls your app with header `X-Router-API-Key: <your app's key>` and body:
```json
{ "phone": "+1...", "body": "user text", "appSource": "connectiko",
  "sessionState": "", "sessionData": {} }
```
Your app verifies the key and responds:
```json
{ "reply": "text to send back", "sessionState": "optional", "sessionData": {} }
```
Return `{ "reply": "" }` to acknowledge without replying.

## Environment
See `.env.example`. Required: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`,
`MONGODB_URI`, `PUBLIC_URL`, and at least one `ROUTER_API_KEY_<APP>`.
`TWILIO_MESSAGING_SERVICE_SID` is strongly recommended (A2P 10DLC deliverability).
Generate each app key with `openssl rand -hex 32`.

## Data (MongoDB)
- `smsusers` — `phone` (unique), `appSource`, `sessionState`, `sessionData`, `optedOut`.
- `smssuppressions` — global do-not-text list keyed by `phone` (STOP adds, START removes).
- `smsmessages` — outbound log: app, to, type, Twilio `sid`, `status`, `idempotencyKey`, consent. OTP bodies are stored as `[redacted]`.
- `otpsessions` — `phone`, `codeHash` (bcrypt), `appSource`, `attempts`, `expiresAt` (TTL; auto-expires).

## Run locally
```bash
cp .env.example .env     # fill in values; set SKIP_TWILIO_SIGNATURE=true for curl testing
npm install
npm test                 # unit tests (no DB needed)
npm run smoke            # end-to-end against local Mongo, dry-run (no real SMS)
npm run dev              # needs a reachable MONGODB_URI
```

## Deploy (Render + MongoDB Atlas)
1. Create a free MongoDB Atlas cluster; copy its connection string into `MONGODB_URI`.
2. Push this repo and connect it on Render (uses `render.yaml`), or deploy the `Dockerfile`.
3. Set all secrets in the Render dashboard. Set `PUBLIC_URL` to the service's public URL.
4. In the Twilio console, point the number's **Messaging webhook** at `https://<PUBLIC_URL>/webhook`.

## Security
- Twilio signature validated on `/webhook`.
- `/register`, `/unregister`, `/send-otp`, `/verify-otp` require the per-app key (constant-time compare).
- OTP codes stored only as bcrypt hashes, 5-attempt cap, 10-minute TTL.
