const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  checkIn: { type: Date, required: true },
  checkOut: { type: Date, required: true },
  guests: { type: Number, default: 1 },
  totalPrice: { type: Number, default: 0 },
  discountApplied: { type: Number, default: 0 },
  status: { type: String, default: 'pending' } // pending | paid | confirmed | cancelled
}, { timestamps: true });

module.exports = mongoose.model('Booking', bookingSchema);
