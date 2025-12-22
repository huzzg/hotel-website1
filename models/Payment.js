const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  amount: { type: Number, required: true },
  method: { type: String, default: 'credit_card' },
  status: { type: String, default: 'unpaid' }
});

module.exports = mongoose.model('Payment', paymentSchema);