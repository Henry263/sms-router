const { loadEnv } = require('./config/env');
loadEnv();

const { connectDb } = require('./config/db');
const { createApp } = require('./app');

const app = createApp();
const PORT = process.env.PORT || 3000;

connectDb(process.env.MONGODB_URI)
  .then(() => app.listen(PORT, () => console.log(`[sms-router] listening on ${PORT}`)))
  .catch((err) => {
    console.error('[sms-router] failed to start:', err.message);
    process.exit(1);
  });

module.exports = app;
