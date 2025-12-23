// controllers/paymentController.js
const axios = require("axios");
const crypto = require("crypto");
const Booking = require("../models/Booking");
const Payment = require("../models/Payment");

class PaymentController {
  // 🧾 Tạo thanh toán MoMo QR
  async createMoMoPayment(req, res) {
    try {
      const { bookingId } = req.body;
      const booking = await Booking.findById(bookingId).populate("roomId");

      if (!booking) {
        return res.status(404).json({ message: "Không tìm thấy đặt phòng" });
      }

      const amount = booking.totalPrice.toString();
      const partnerCode = "MOMO";
      const accessKey = "F8BBA842ECF85";
      const secretKey = "K951B6PE1waDMi640xX08PD3vg6EkVlz";
      const orderId = `${partnerCode}${Date.now()}`;
      const requestId = orderId;
      const orderInfo = `Thanh toán phòng ${booking.roomId.roomNumber}`;
      const redirectUrl = "http://localhost:3000/payment/momo/return";
      const ipnUrl = "http://localhost:3000/payment/momo/notify";
      const requestType = "captureWallet";
      const extraData = "";

      // 🔐 Tạo chữ ký
      const rawSignature = `accessKey=${accessKey}&amount=${amount}&extraData=${extraData}&ipnUrl=${ipnUrl}&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${partnerCode}&redirectUrl=${redirectUrl}&requestId=${requestId}&requestType=${requestType}`;
      const signature = crypto.createHmac("sha256", secretKey).update(rawSignature).digest("hex");

      const requestBody = {
        partnerCode,
        accessKey,
        requestId,
        amount,
        orderId,
        orderInfo,
        redirectUrl,
        ipnUrl,
        extraData,
        requestType,
        signature,
        lang: "vi",
      };

      // 📡 Gửi yêu cầu đến MoMo Sandbox
      const response = await axios.post("https://test-payment.momo.vn/v2/gateway/api/create", requestBody);

      if (response.data && response.data.payUrl) {
        // Lưu orderId tạm để mapping callback
        booking.momoOrderId = orderId;
        await booking.save();

        return res.redirect(response.data.payUrl);
      } else {
        res.status(500).json({ message: "Không nhận được payUrl từ MoMo" });
      }
    } catch (error) {
      console.error("Lỗi tạo thanh toán MoMo:", error);
      res.status(500).json({ message: "Lỗi server khi tạo thanh toán MoMo", error });
    }
  }

  // 🔁 Nhận callback khi MoMo phản hồi (IPN)
async handleMoMoNotify(req, res) {
  try {
    const { orderId, resultCode, amount, message } = req.body;

    // 🟢 Trường hợp thanh toán thành công
    if (resultCode === 0) {
      // 🔍 Tìm booking tương ứng với orderId
      const booking = await Booking.findOne({ momoOrderId: orderId }).populate("roomId userId");

      if (booking) {
        // ✅ Cập nhật trạng thái đơn đặt phòng
        booking.status = "paid";
        booking.isPaid = true;
        booking.paidAt = new Date();
        await booking.save();

        // ✅ Đánh dấu phòng này đã có khách
        if (booking.roomId) {
          booking.roomId.isBooked = true;
          await booking.roomId.save();
        } else {
          await Room.findByIdAndUpdate(booking.roomId, { isBooked: true });
        }

        // ✅ Lưu bản ghi thanh toán
        const payment = new Payment({
          bookingId: booking._id,
          userId: booking.userId?._id,
          amount: parseInt(amount),
          method: "momo",
          status: "paid",
          paidAt: new Date(),
        });
        await payment.save();

        console.log("✅ Thanh toán thành công:", booking._id);
        console.log("💰 Số tiền:", amount);
        console.log("🕒 Thời điểm thanh toán:", payment.paidAt);
        console.log("🏠 Phòng đã đánh dấu là đã có khách:", booking.roomId?._id);
        console.log("👤 Người dùng:", booking.userId?.email || "Không xác định");
      } else {
        console.warn("⚠️ Không tìm thấy booking tương ứng với orderId:", orderId);
      }

    } else {
      console.log("❌ Thanh toán thất bại:", message);
    }

    // ✅ MoMo yêu cầu phản hồi HTTP 200 để xác nhận callback đã được nhận
    res.status(200).json({ message: "acknowledged" });

  } catch (error) {
    console.error("💥 Lỗi xử lý callback MoMo:", error);
    res.status(500).json({ message: "Lỗi xử lý callback" });
  }
}

// 🧭 Trang chuyển hướng sau thanh toán
async returnFromMoMo(req, res) {
  try {
    const { resultCode } = req.query;

    if (resultCode === "0") {
      res.render("payment_success", { message: "Thanh toán thành công!" });
    } else {
      res.render("payment_fail", { message: "Thanh toán thất bại, vui lòng thử lại." });
    }
  } catch (error) {
    console.error("💥 Lỗi khi xử lý returnFromMoMo:", error);
    res.render("payment_fail", { message: "Có lỗi xảy ra khi xử lý phản hồi." });
  }
}
}
module.exports = new PaymentController();
