// config/db.js
const mongoose = require('mongoose');

const MONGO_URI =
  process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hotel';

mongoose.set('strictQuery', true);

mongoose
  .connect(MONGO_URI, {
    // giúp fail sớm khi không kết nối được
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 10000,
  })
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((err) => {
    console.error('MongoDB connect error:', err.message);
  });

module.exports = mongoose;
