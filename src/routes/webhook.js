const express = require('express');
const router = express.Router();
const { validateTwilioSignature } = require('../middleware/twilioSignature');
const { handleInbound } = require('../services/router');

/** POST /webhook — Twilio inbound SMS. Returns TwiML. */
router.post('/webhook', validateTwilioSignature, async (req, res) => {
  const twilio = require('twilio');
  const twiml = new twilio.twiml.MessagingResponse();
  try {
    const { reply } = await handleInbound({ from: req.body.From, body: req.body.Body });
    if (reply) twiml.message(reply);
  } catch (err) {
    console.error('[sms-router] webhook error:', err.message);
  }
  res.type('text/xml').send(twiml.toString());
});

module.exports = router;
