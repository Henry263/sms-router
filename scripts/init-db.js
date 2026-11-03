/**
 * Create the router's collections and indexes (idempotent). Run once after the first deploy:
 *   node scripts/init-db.js
 * Reads MONGODB_URI from .env. Mongoose would create these lazily on first use; doing it up front makes
 * the database visible immediately and surfaces index problems early.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const MODELS = ['SmsUser', 'SmsSuppression', 'SmsMessage', 'OtpSession'];

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(uri);
  console.log('Database:', mongoose.connection.name);

  for (const name of MODELS) {
    const Model = require(`../src/models/${name}`);
    await Model.createCollection();
    await Model.syncIndexes();
    const idx = (await Model.collection.indexes()).map((i) => Object.keys(i.key).join('+')).join(', ');
    console.log(`  ${Model.collection.collectionName}: indexes [${idx}]`);
  }
  await mongoose.disconnect();
})().catch((e) => { console.error('init-db failed:', e.message); process.exit(1); });
