const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema(
  {
    roomNumber: { type: String, required: true },
    name: { type: String },
    roomName: { type: String }, // 👈 Thêm dòng này để tương thích controller
    title: { type: String }, // 👈 Nếu bạn dùng title ở chỗ khác
    type: { type: String, required: true },
    price: { type: Number, default: 0 },
    status: { type: String, default: 'available' },
    image: { type: String },
    description: { type: String, default: '' },
    isBooked: {
    type: Boolean,
    default: false,
  },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Room', RoomSchema);
