// models/Discount.js
const mongoose = require('mongoose');

const DiscountSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true, uppercase: true },
  percent: { type: Number, required: true, min: 0, max: 100 },
  startDate: { type: Date, default: null }, // nếu null => bắt đầu ngay
  endDate: { type: Date, default: null },   // nếu null => vô hạn
  active: { type: Boolean, default: true }, // bật/tắt mã
}, {
  timestamps: true
});

// helper: kiểm tra mã có hiệu lực tại thời điểm now
DiscountSchema.methods.isActiveNow = function(now = new Date()) {
  if (!this.active) return false;
  if (this.startDate && this.startDate > now) return false;
  if (this.endDate && this.endDate < now) return false;
  return true;
};

module.exports = mongoose.model('Discount', DiscountSchema);
