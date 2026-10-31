// Carrier-compliance keywords, handled centrally for every app.
const STOP = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const START = new Set(['START', 'YES', 'UNSTOP']);
const HELP = new Set(['HELP', 'INFO']);

const HELP_TEXT = 'Help: reply STOP to opt out. Support: support@connectiko.io. Msg&data rates may apply.';
const STOP_TEXT = 'You are unsubscribed and will no longer receive messages. Reply START to opt back in.';
const START_TEXT = "You're resubscribed. Reply STOP to opt out at any time.";

/** Return 'stop' | 'start' | 'help' | null for a message body. */
function classify(body) {
  const k = String(body || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (STOP.has(k)) return 'stop';
  if (START.has(k)) return 'start';
  if (HELP.has(k)) return 'help';
  return null;
}

module.exports = { classify, HELP_TEXT, STOP_TEXT, START_TEXT };
