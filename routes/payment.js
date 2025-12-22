// routes/payment.js
const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const Discount = require('../models/Discount'); // thêm model giảm giá
const { requireAuth } = require('../middleware/authMiddleware');
const crypto = require("crypto");
const axios = require("axios");

// ========================== Stripe (cũ) ==========================
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  try {
    const Stripe = require('stripe');
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  } catch (e) {
    console.warn('[payment] Stripe init failed, fallback to mock.', e?.message || e);
    stripe = null;
  }
}

function calcNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 1;
  const inDate = new Date(checkIn);
  const outDate = new Date(checkOut);
  const ms = outDate - inDate;
  const nights = Math.ceil(ms / (1000 * 60 * 60 * 24));
  return Number.isFinite(nights) && nights > 0 ? nights : 1;
}

/**
 * POST /payment/checkout (Stripe hoặc mock)
 */
router.post('/checkout', async (req, res, next) => {
  try {
    const { amount, pricePerNight, checkIn, checkOut, currency: rawCurrency, metadata = {} } = req.body || {};
    let total = Number(amount);
    if (!Number.isFinite(total) || total <= 0) {
      const nights = calcNights(checkIn, checkOut);
      const price = Number(pricePerNight) || 0;
      total = Math.max(price * nights, 0);
    }

    if (!stripe) {
      return res.json({
        ok: true,
        mode: 'mock',
        currency: rawCurrency || 'vnd',
        amount: total,
        message: 'Thanh toán mock thành công (Stripe chưa cấu hình).'
      });
    }

    const currency = (rawCurrency || 'usd').toLowerCase();
    const amountInSmallestUnit = currency === 'usd' ? Math.round(total * 100) : Math.round(total);
    const intent = await stripe.paymentIntents.create({ amount: amountInSmallestUnit, currency, metadata });

    return res.json({
      ok: true,
      mode: 'stripe',
      clientSecret: intent.client_secret,
      currency,
      amount: amountInSmallestUnit
    });
  } catch (err) {
    console.error('[payment] checkout error:', err);
    next(err);
  }
});


/**
 * POST /payment/user/confirm
 */
router.post('/user/confirm', requireAuth, async (req, res) => {
  try {
    const bookingId = req.body.bookingId || req.query.bookingId;
    const method = req.body.method || req.body.paymentMethod || 'momo';
    const transactionId = req.body.transactionId || req.body.txn || null;

    if (!bookingId) return res.status(400).send('Missing bookingId');

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).send('Booking not found');

    if (booking.status === 'paid') {
      return res.redirect(`/user/booking-confirm?bookingId=${bookingId}`);
    }

    try {
      if (Payment) {
        const pay = await Payment.create({
          bookingId: booking._id,
          amount: booking.totalPrice || 0,
          method,
          status: 'paid',
          transactionId: transactionId || `SIM-${Date.now()}`,
          paidAt: new Date()
        });
        booking.paymentId = pay._id;
      }
    } catch (e) {
      console.warn('Could not create Payment doc:', e);
    }

    booking.status = 'paid';
    await booking.save();
    return res.redirect(`/user/booking-confirm?bookingId=${bookingId}`);
  } catch (err) {
    console.error('POST /payment/user/confirm error', err);
    return res.status(500).send('Server error');
  }
});

// ======================= Thêm phần MoMo Sandbox =======================

/**
 * POST /payment/momo/create
 * Tạo thanh toán MoMo QR tự động + trừ giảm giá (nếu có)
 */
router.post("/momo/create", requireAuth, async (req, res) => {
  try {
    const { bookingId, discountCode } = req.body;
    if (!bookingId) return res.status(400).send("Thiếu bookingId");

    const booking = await Booking.findById(bookingId).populate("roomId");
    if (!booking) return res.status(404).send("Không tìm thấy booking");

    let totalAmount = booking.totalPrice;

    // Nếu người dùng có nhập mã giảm giá
    if (discountCode && discountCode.trim() !== "") {
      const discount = await Discount.findOne({ code: discountCode.trim().toUpperCase(), active: true });
      if (discount) {
        const now = new Date();
        const start = new Date(discount.startDate);
        const end = new Date(discount.endDate);
        if (now >= start && now <= end) {
          const percent = Number(discount.percent) || 0;
          totalAmount = Math.max(totalAmount - (totalAmount * percent) / 100, 0);
          console.log(`Áp mã ${discount.code}: -${percent}% => còn ${totalAmount}`);
        }
      }
    }

    // --- Thông tin MoMo test ---
    const partnerCode = "MOMO";
    const accessKey = "F8BBA842ECF85";
    const secretKey = "K951B6PE1waDMi640xX08PD3vg6EkVlz";
    const requestId = partnerCode + Date.now();
    const orderId = requestId;
    const orderInfo = `Thanh toán đặt phòng ${booking.roomId.roomNumber}`;
    const redirectUrl = "http://localhost:3000/payment/momo/return";
    const ipnUrl = "http://localhost:3000/payment/momo/notify";
    const amount = totalAmount.toString();
    const requestType = "captureWallet";
    const extraData = "";

    const rawSignature =
      `accessKey=${accessKey}&amount=${amount}&extraData=${extraData}` +
      `&ipnUrl=${ipnUrl}&orderId=${orderId}&orderInfo=${orderInfo}` +
      `&partnerCode=${partnerCode}&redirectUrl=${redirectUrl}` +
      `&requestId=${requestId}&requestType=${requestType}`;
    const signature = crypto.createHmac("sha256", secretKey)
      .update(rawSignature)
      .digest("hex");

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
      lang: "vi"
    };

    const response = await axios.post("https://test-payment.momo.vn/v2/gateway/api/create", requestBody);

    if (response.data && response.data.payUrl) {
      booking.momoOrderId = orderId;
      booking.discountCode = discountCode || null;
      booking.amountAfterDiscount = totalAmount;
      await booking.save();
      return res.json({ payUrl: response.data.payUrl });
    } else {
      return res.status(500).send("Không nhận được payUrl từ MoMo");
    }
  } catch (err) {
    console.error("Lỗi tạo thanh toán MoMo:", err);
    res.status(500).send("Lỗi khi tạo thanh toán MoMo");
  }
});

/**
 * POST /payment/momo/notify
 */
router.post("/momo/notify", async (req, res) => {
  try {
    const { orderId, resultCode, amount } = req.body;
    if (resultCode === 0) {
      const booking = await Booking.findOne({ momoOrderId: orderId });
      if (booking) {
        booking.status = "paid";
        await booking.save();

        await Payment.create({
          bookingId: booking._id,
          amount: parseInt(amount),
          method: "momo",
          status: "paid",
          paidAt: new Date()
        });
        console.log("✅ Thanh toán MoMo thành công:", booking._id);
      }
    }
    res.status(200).json({ message: "acknowledged" });
  } catch (err) {
    console.error("❌ Lỗi xử lý notify MoMo:", err);
    res.status(500).send("Lỗi xử lý callback");
  }
});

router.get('/user', requireAuth, async (req, res) => {
  try {
    const bookingId = req.query.bookingId;
    const status = req.query.status || null;
    if (!bookingId) return res.status(400).send('Missing bookingId');

    const booking = await Booking.findById(bookingId).populate('roomId').lean();
    if (!booking) return res.status(404).send('Booking not found');

    if (booking.status === 'paid') {
      return res.redirect(`/user/booking-confirm?bookingId=${bookingId}`);
    }

    const momoQRCode = '/images/qrcodes/momo-sample.jpg';
    const vnpayQRCode = '/images/qrcodes/vnpay-sample.jpg';

    res.render('payment', {
      title: 'Thanh toán',
      booking,
      momoQRCode,
      vnpayQRCode,
      status, // ✅ thêm dòng này
    });
  } catch (err) {
    console.error('GET /payment/user error', err);
    res.status(500).send('Server error');
  }
});

/**
 * GET /payment/momo/return
 * Khi người dùng được redirect về từ MoMo sau thanh toán
 */
router.get("/momo/return", async (req, res) => {
  try {
    const { resultCode, orderId, message } = req.query;
    console.log("📩 MoMo return:", req.query);

    // Tìm booking theo orderId
    const booking = await Booking.findOne({ momoOrderId: orderId });
    if (!booking) {
      console.warn("⚠️ Không tìm thấy booking tương ứng:", orderId);
      return res.redirect(`/payment/user?status=error`);
    }

    // Thành công
    if (resultCode === "0") {
      booking.status = "paid";
      await booking.save();

      await Payment.create({
        bookingId: booking._id,
        amount: booking.amountAfterDiscount || booking.totalPrice,
        method: "momo",
        status: "paid",
        paidAt: new Date(),
      });

      console.log("✅ Thanh toán MoMo thành công cho booking:", booking._id);
      return res.redirect(`/payment/user?bookingId=${booking._id}&status=success`);
    }

    // Thất bại
    console.warn("❌ Thanh toán thất bại:", message);
    return res.redirect(`/payment/user?bookingId=${booking._id}&status=failed`);
  } catch (err) {
    console.error("❌ Lỗi trong /payment/momo/return:", err);
    res.redirect(`/payment/user?status=error`);
  }
});


module.exports = router;
