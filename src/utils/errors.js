/** An expected, client-facing failure (bad input, opted out, rate limited...). */
class SendError extends Error {
  constructor(code, status, message) {
    super(message || code);
    this.code = code;
    this.status = status;
  }
}

module.exports = { SendError };
