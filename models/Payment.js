const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true },
    amount: { type: Number, required: true },
    method: { type: String, default: "momo" },
    status: { type: String, default: "unpaid" }, // unpaid | paid | failed
     paidAt: { type: Date },
    bookingStatus: { type: String, default: "pending" } // để đồng bộ tạm thời
  },
  { timestamps: true } // ✅ Thêm timestamps => tự có createdAt, updatedAt
);

module.exports = mongoose.model("Payment", paymentSchema, "payments");
