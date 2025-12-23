const User = require('../models/User');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const Room = require('../models/Room');
dotenv.config();

const Booking = require("../models/Booking");

// ==================== MULTER SETUP ====================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../public/uploads/avatars');
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
exports.upload = multer({ storage });

// ==================== GET PROFILE ====================
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.session.user._id).lean();
    res.render('user/profile', { 
      data: user, 
      currentUser: user,
      success: null,
      error: null
    });
  } catch (err) {
    console.error('❌ Error loading profile:', err);
    res.status(500).send('Something went wrong!');
  }
};

// ==================== UPDATE PROFILE ====================
exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.session.user._id);
    if (!user) return res.redirect('/auth/login');

    const { name, phone, email, cccd } = req.body;
    if (!user.profile) user.profile = {};

    // upload avatar nếu có
    if (req.file) {
      const avatarPath = path.join(__dirname, '../public', user.avatar || '');
      if (user.avatar && fs.existsSync(avatarPath)) fs.unlinkSync(avatarPath);
      user.avatar = '/uploads/avatars/' + req.file.filename;
    }

    user.email = email;
    user.phone = phone;
    user.profile.name = name;
    user.profile.cccd = cccd;

    await user.save();

    // ✅ Cập nhật session để hiển thị tên mới ngay lập tức
if (req.session.user) {
  req.session.user.profile = req.session.user.profile || {};
  req.session.user.profile.name = user.profile.name;
}


    const updatedUser = await User.findById(req.session.user._id);
    req.session.user = updatedUser;

    res.render('user/profile', {
      data: updatedUser,
      success: '✅ Cập nhật hồ sơ thành công!',
      error: null
    });
  } catch (err) {
    console.error('Lỗi cập nhật hồ sơ:', err);
    res.render('user/profile', {
      data: {},
      error: '❌ Có lỗi xảy ra khi cập nhật hồ sơ!',
      success: null
    });
  }
};

// ==================== FORGOT PASSWORD ====================
exports.handleForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.render('forgot-password', {
        step: 1,
        message: '❌ Không tìm thấy tài khoản với email này.',
        email: null
      });
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    user.resetPasswordOTP = otp;
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 phút
    await user.save();

    // Gửi email
    const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

    const mailOptions = {
      from: `"Hotel Phenikaa" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: 'Mã đặt lại mật khẩu - Hotel Phenikaa',
      html: `<p>Mã xác nhận của bạn là: <b>${otp}</b></p><p>Hiệu lực trong 10 phút.</p>`
    };

    await transporter.sendMail(mailOptions);

    res.render('forgot-password', {
      step: 2,
      email,
      message: '✅ Mã xác thực đã được gửi đến email của bạn.'
    });
  } catch (error) {
    console.error(error);
    res.render('forgot-password', {
      step: 1,
      email: null,
      message: '❌ Có lỗi xảy ra khi gửi mã xác nhận.'
    });
  }
};

// ==================== RESET PASSWORD ====================
exports.handleResetPassword = async (req, res) => {
  try {
    const { email, otp, password, confirmPassword } = req.body;
    const user = await User.findOne({ email });

    if (!user || user.resetPasswordOTP !== otp || user.resetPasswordExpires < Date.now()) {
      return res.render('forgot-password', {
        step: 2,
        email,
        message: '❌ Mã xác nhận không hợp lệ hoặc đã hết hạn.'
      });
    }

    if (password !== confirmPassword) {
      return res.render('forgot-password', {
        step: 2,
        email,
        message: '❌ Mật khẩu xác nhận không khớp.'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    user.resetPasswordOTP = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.render('forgot-password', {
      step: 3,
      email,
      message: '✅ Mật khẩu đã được thay đổi thành công! Bạn có thể đăng nhập lại.'
    });
  } catch (error) {
    console.error(error);
    res.render('forgot-password', {
      step: 2,
      email: req.body.email,
      message: '❌ Có lỗi xảy ra, vui lòng thử lại.'
    });
  }
};


// ==================== LỊCH SỬ ĐẶT PHÒNG ====================
exports.getHistory = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const bookings = await Booking.find({ userId })
      .populate('roomId')
      .populate('userId') // quan trọng để lấy avatar và tên
      .sort({ createdAt: -1 })
      .lean();

    res.render('history', {
      bookings,
      user: req.session.user
    });
  } catch (err) {
    console.error('❌ Lỗi tải lịch sử đặt phòng:', err);
    res.status(500).send('Lỗi khi tải lịch sử đặt phòng');
  }
};

// ==================== CHI TIẾT ĐẶT PHÒNG ====================
exports.viewBookingDetail = async (req, res) => {
  try {
    const bookingId = req.query.bookingId;
    const booking = await Booking.findById(bookingId)
      .populate('roomId')
      .populate('userId')
      .lean();
    if (!booking) return res.status(404).send('Không tìm thấy đơn đặt phòng');

    res.render('booking-confirm', {
      booking,
      user: req.session.user
    });
  } catch (err) {
    console.error('❌ Lỗi xem chi tiết đặt phòng:', err);
    res.status(500).send('Lỗi khi xem chi tiết đặt phòng');
  }
};

// ==================== ĐẶT PHÒNG ====================
  exports.bookRoom = async (req, res) => {
  try {
    console.log(">>> Body nhận được:", req.body);

    // ✅ Kiểm tra đăng nhập kỹ hơn
    if (!req.session || !req.session.user) {
      console.warn("⚠️ Người dùng chưa đăng nhập, chặn đặt phòng.");
      return res.status(401).render('error', {
        message: 'Bạn cần đăng nhập để đặt phòng!',
        redirectUrl: '/auth/login'
      });
    }

    const { roomId, checkIn, checkOut, guests, totalPrice, discountCode } = req.body;
    const currentUser = req.user || req.session?.user;

    // ✅ Kiểm tra đăng nhập
    if (!currentUser) return res.redirect('/auth/login');

    // ✅ Kiểm tra roomId hợp lệ
    if (!roomId) {
      console.error("❌ Thiếu roomId trong body!");
      return res.status(400).send("Thiếu thông tin phòng.");
    }

    // ✅ Lấy thông tin phòng
    const room = await Room.findById(roomId);
    if (!room) {
      console.error("❌ Không tìm thấy phòng có ID:", roomId);
      return res.status(404).send('Không tìm thấy phòng.');
    }

    // ✅ Tính toán mã giảm giá (nếu có)
    let discountValue = 0;
    if (discountCode && discountCode.trim() !== "") {
      const discount = await Discount.findOne({ code: discountCode.trim(), active: true });
      if (discount) discountValue = discount.value;
    }

    // ✅ Chuyển totalPrice sang số (phòng trường hợp gửi chuỗi)
    const numericTotal = Number(totalPrice) || 0;
    const finalPrice = numericTotal - discountValue;

    console.log(">>> Dữ liệu gửi tạo Booking:", {
      userId: currentUser?._id || currentUser?.id,
      roomId,
      checkIn,
      checkOut,
      guests,
      totalPrice: finalPrice,
      status: "pending",
    });

    // ✅ Tạo booking mới
    const booking = await Booking.create({
      userId: currentUser._id || currentUser.id,
      roomId,
      checkIn: new Date(checkIn),
      checkOut: new Date(checkOut),
      guests,
      totalPrice: finalPrice,
      status: 'pending',
    });

    console.log("✅ Đặt phòng thành công:", booking._id);

    // ✅ Chuyển hướng đến lịch sử đặt phòng
    res.redirect('/user/history');
  } catch (err) {
    console.error('❌ Lỗi khi đặt phòng chi tiết:', err);
    res.status(500).send('Lỗi xử lý đặt phòng: ' + err.message);
  }
};

// ==================== ADMIN DASHBOARD ====================
exports.getAdminDashboard = async (req, res) => {
  try {
    const range = req.query.range || 'month';
    const dateParam = req.query.date || new Date().toISOString().slice(0, 7); // YYYY-MM
    let startDate, endDate, selectedDate;

    if (range === 'day') {
      selectedDate = new Date(dateParam);
      startDate = new Date(selectedDate.setHours(0, 0, 0, 0));
      endDate = new Date(selectedDate.setHours(23, 59, 59, 999));
    } else if (range === 'month') {
      const [year, month] = dateParam.split('-').map(Number);
      selectedDate = new Date(year, month - 1);
      startDate = new Date(year, month - 1, 1);
      endDate = new Date(year, month, 0, 23, 59, 59, 999);
    } else {
      const year = parseInt(dateParam) || new Date().getFullYear();
      selectedDate = new Date(year, 0, 1);
      startDate = new Date(year, 0, 1);
      endDate = new Date(year, 11, 31, 23, 59, 59, 999);
    }

    const bookings = await Booking.find({
      createdAt: { $gte: startDate, $lte: endDate },
      status: { $in: ['paid', 'confirmed'] },
    });

    const usersCount = await User.countDocuments();
    const roomsCount = await Room.countDocuments();
    const bookingsCount = bookings.length;
    const totalRevenue = bookings.reduce((sum, b) => sum + (b.totalPrice || 0), 0);

    // Nhóm dữ liệu cho bảng
    const statsMap = {};
    for (const b of bookings) {
      const d = new Date(b.createdAt);
      let key = '';

     // ✅ Chuẩn hóa lại logic cho đúng ngữ cảnh
// ✅ Hiển thị đúng theo cấp người dùng chọn
if (range === "day") {
  // Theo ngày -> hiển thị ngày (VD: 02/12/2025)
  key = d.toISOString().split("T")[0]; 
} else if (range === "month") {
  // Theo tháng -> hiển thị tháng (VD: 12)
  key = (d.getMonth() + 1).toString().padStart(2, "0");
} else if (range === "year") {
  // Theo năm -> hiển thị năm (VD: 2025)
  key = d.getFullYear().toString();
}
      if (!statsMap[key]) statsMap[key] = { count: 0, total: 0 };
      statsMap[key].count++;
      statsMap[key].total += b.totalPrice || 0;
    }

    const statsRows = Object.keys(statsMap)
      .map(k => ({ key: k, count: statsMap[k].count, total: statsMap[k].total }))
      .sort((a, b) => parseInt(a.key) - parseInt(b.key));

    res.render('admin-dashboard', {
      usersCount,
      roomsCount,
      bookingsCount,
      totalOrders: bookingsCount,
      totalRevenue,
      statsRows,
      range,
      selectedDate,
      selectedRange: range,
    });
  } catch (err) {
    console.error('❌ Lỗi khi tải trang admin dashboard:', err);
    res.status(500).send('Lỗi khi tải trang admin dashboard.');
  }
};

// ==================== GỬI EMAIL XÁC NHẬN ĐẶT PHÒNG ====================
exports.sendBookingEmail = async (req, res) => {
  try {
    const userId = req.session.user?._id;
    const { bookingId } = req.body;

    if (!userId) return res.status(401).json({ message: "Bạn chưa đăng nhập!" });

    const booking = await Booking.findById(bookingId).populate("roomId").lean();
    if (!booking) return res.status(404).json({ message: "Không tìm thấy đơn đặt phòng." });

    const user = await User.findById(userId);
    if (!user || !user.email)
      return res.status(400).json({ message: "Không tìm thấy email người dùng." });

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER, // bạn đã dùng để gửi mã OTP
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"Hotel Phenikaa" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "Xác nhận đặt phòng tại Hotel Phenikaa",
      html: `
        <h2>Xin chào ${user.username || "Quý khách"},</h2>
        <p>Cảm ơn bạn đã đặt phòng tại <strong>Hotel Phenikaa</strong>.</p>
        <h3>Thông tin đặt phòng:</h3>
        <ul>
          <li><b>Phòng:</b> ${booking.roomId.name || booking.roomId.type}</li>
          <li><b>Giá tiền:</b> ${booking.totalPrice.toLocaleString()}₫</li>
          <li><b>Check-in:</b> ${new Date(booking.checkIn).toLocaleDateString("vi-VN")}</li>
          <li><b>Check-out:</b> ${new Date(booking.checkOut).toLocaleDateString("vi-VN")}</li>
          <li><b>Trạng thái:</b> ${booking.status}</li>
        </ul>
        <p>Chúc bạn có trải nghiệm tuyệt vời!</p>
        <p><i>Trân trọng,<br>Hotel Phenikaa</i></p>
      `,
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: "✅ Đã gửi thông tin đặt phòng qua email!" });
  } catch (error) {
    console.error("❌ Lỗi gửi email:", error);
    res.status(500).json({ success: false, message: "Lỗi gửi email, vui lòng thử lại." });
  }
};


// ==================== LOGOUT ====================
exports.logout = (req, res) => {
  req.session.destroy(err => {
    if (err) console.error('❌ Lỗi khi xóa session:', err);
    res.clearCookie('connect.sid', { path: '/' }); // xóa cookie session
    res.clearCookie('token', { path: '/' });       // nếu có dùng JWT
    return res.redirect('/');
  });
};












