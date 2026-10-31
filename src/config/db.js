const mongoose = require('mongoose');

async function connectDb(uri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log('[sms-router] MongoDB connected');
  return mongoose.connection;
}

module.exports = { connectDb };
