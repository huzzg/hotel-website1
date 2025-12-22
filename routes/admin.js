// routes/admin.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const requireAdmin = require('../middleware/requireAdmin');
const userController = require('../controllers/userController');
const User = require('../models/User');
const Room = require('../models/Room');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const Discount = require('../models/Discount');

// Bảo vệ tất cả route admin
router.use(requireAdmin);

router.get('/dashboard', requireAdmin, userController.getAdminDashboard);

// multer & upload dir (giữ nguyên)
const multer = require('multer');
const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'rooms');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/\s+/g, '-');
    cb(null, Date.now() + '-' + safe);
  }
});
const upload = multer({ storage });

// parsePriceInput helper (giữ nguyên)
function parsePriceInput(raw) {
  if (raw === undefined || raw === null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/\s+/g, '');
  if (s.indexOf('.') !== -1 && s.indexOf(',') !== -1) {
    s = s.replace(/\./g, '').replace(/,/g, '.');
  } else {
    s = s.replace(/\./g, '').replace(/,/g, '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// DASHBOARD
router.get('/dashboard', async (req, res, next) => {
  try {
    const range = (req.query.range || 'month').toLowerCase(); // day|month|year
    const date = req.query.date || null;

    // users count, rooms count
    const [usersCount, roomsCount] = await Promise.all([
      User.countDocuments({}),
      Room.countDocuments({})
    ]);

    // bookingsCount: KHÔNG tính các đơn đã hủy
    const bookingsCount = await Booking.countDocuments({ status: { $ne: 'cancelled' } });

    // Payment match: only real payments with status 'paid'
    const paymentMatch = { status: 'paid' };

    // Build date filters in UTC (so filters match stored ISO times)
    if (date) {
      if (range === 'day') {
        // expected date format: YYYY-MM-DD
        const parts = date.split('-');
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        // use UTC boundaries so no timezone shift problems
        const start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
        const end = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));
        paymentMatch.paidAt = { $gte: start, $lte: end };
      } else if (range === 'month') {
        // expected date format: YYYY-MM
        const parts = date.split('-');
        if (parts.length === 2) {
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
          // month+1 day 0 -> last day of month
          const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
          paymentMatch.paidAt = { $gte: start, $lte: end };
        }
      } else if (range === 'year') {
        const year = parseInt(date, 10);
        if (!Number.isNaN(year)) {
          const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
          const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
          paymentMatch.paidAt = { $gte: start, $lte: end };
        }
      }
    }

    // totalRevenue based on payments (status: 'paid')
    // Additionally exclude payments whose booking is CANCELLED (so test cancelled orders are not counted)
    const totalAgg = await Payment.aggregate([
      { $match: paymentMatch },
      // join booking to check its status
      {
        $lookup: {
          from: 'bookings',
          localField: 'bookingId',
          foreignField: '_id',
          as: 'booking'
        }
      },
      { $unwind: { path: '$booking', preserveNullAndEmptyArrays: true } },
      { $match: { $or: [{ 'booking.status': { $exists: false } }, { 'booking.status': { $ne: 'cancelled' } }] } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$amount', 0] } }, count: { $sum: 1 } } }
    ]).catch(() => []);

    const totalRevenue = (totalAgg && totalAgg.length) ? totalAgg[0].total : 0;

    // group format by range (use timezone +07:00 for readable grouping in VN)
    let groupFormat = { $dateToString: { format: "%Y-%m", date: "$paidAt", timezone: "+07:00" } };
    if (range === 'day') groupFormat = { $dateToString: { format: "%Y-%m-%d", date: "$paidAt", timezone: "+07:00" } };
    else if (range === 'year') groupFormat = { $dateToString: { format: "%Y", date: "$paidAt", timezone: "+07:00" } };

    const payPipeline = [];
    if (Object.keys(paymentMatch).length) payPipeline.push({ $match: paymentMatch });

    // ensure we exclude cancelled bookings in the per-bucket stats as well
    payPipeline.push({
      $lookup: {
        from: 'bookings',
        localField: 'bookingId',
        foreignField: '_id',
        as: 'booking'
      }
    });
    payPipeline.push({ $unwind: { path: '$booking', preserveNullAndEmptyArrays: true } });
    payPipeline.push({ $match: { $or: [{ 'booking.status': { $exists: false } }, { 'booking.status': { $ne: 'cancelled' } }] } });

    payPipeline.push({
      $group: {
        _id: groupFormat,
        total: { $sum: { $ifNull: ["$amount", 0] } },
        count: { $sum: 1 }
      }
    });
    payPipeline.push({ $sort: { "_id": -1 } });

    const payStats = await Payment.aggregate(payPipeline).catch(() => []);

    const rows = payStats.map(item => {
      const key = item._id || '/';
      return { key, total: item.total || 0, count: item.count || 0 };
    });

    return res.render('admin-dashboard', {
      title: 'Admin • Dashboard',
      usersCount,
      roomsCount,
      bookingsCount,
      totalRevenue,
      statsRows: rows,
      selectedRange: range,
      selectedDate: date || ''
    });
  } catch (err) {
    next(err);
  }
});

// ROOMS (giữ nguyên)
router.get('/rooms', async (req, res, next) => {
  try {
    const rooms = await Room.find({}).sort({ createdAt: -1 }).lean();
    res.render('admin-rooms', { title: 'Admin • Quản lý phòng', rooms });
  } catch (e) { next(e); }
});

// POST thêm phòng
router.post('/rooms', upload.single('image'), async (req, res, next) => {
  try {
    const { roomNumber, type, price, status, location, description } = req.body;
    const parsedPrice = parsePriceInput(price);

    const image = req.file
      ? '/uploads/rooms/' + req.file.filename
      : (req.body.existingImage || '');

    await Room.create({
      roomNumber,
      type,
      price: parsedPrice,
      status,
      location,
      description, // ✅ THÊM
      image
    });

    res.redirect('/admin/rooms');
  } catch (e) {
    next(e);
  }
});

// CẬP NHẬT PHÒNG
router.post('/rooms/:id', upload.single('image'), async (req, res, next) => {
  try {
    const { roomNumber, type, price, status, description, existingImage } = req.body;

    const updateData = {
      roomNumber,
      type,
      price: Number(price),
      status,
      description
    };

    // Nếu upload ảnh mới
    if (req.file) {
      updateData.image = '/uploads/rooms/' + req.file.filename;
    } 
    // Nếu không upload ảnh mới → giữ ảnh cũ
    else if (existingImage) {
      updateData.image = existingImage;
    }

    await Room.findByIdAndUpdate(req.params.id, updateData);

    res.redirect('/admin/rooms');
  } catch (err) {
    next(err);
  }
});


router.post('/rooms/:id/delete', async (req, res, next) => {
  try {
    await Room.findByIdAndDelete(req.params.id);
    res.redirect('/admin/rooms');
  } catch (e) { next(e); }
});

// BOOKINGS
router.get('/bookings', async (req, res, next) => {
  try {
    // show all bookings (including cancelled) so admin can review or delete
    const bookings = await Booking.find({})
      .populate('userId', 'username email')
      .populate('roomId', 'roomNumber type price')
      .sort({ createdAt: -1 })
      .lean();

    res.render('admin-bookings', {
      title: 'Admin • Đơn đặt phòng',
      bookings
    });
  } catch (e) { next(e); }
});

// Update booking status
router.post('/bookings/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body; // pending | checked_in | checked_out | cancelled
    await Booking.findByIdAndUpdate(req.params.id, { status });
    res.redirect('/admin/bookings');
  } catch (e) { next(e); }
});

// Delete booking (new)
router.post('/bookings/:id/delete', async (req, res, next) => {
  try {
    // Optionally: you could archive instead of delete. Here we remove the booking doc.
    await Booking.findByIdAndDelete(req.params.id);
    // Also consider deleting related payment record(s) if they exist and are test data.
    res.redirect('/admin/bookings');
  } catch (e) {
    next(e);
  }
});

// USERS
router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 }).lean();
    res.render('admin-users', { title: 'Admin • Khách hàng', users });
  } catch (e) { next(e); }
});

// ✅ Chặn / Mở khóa
router.post('/users/:id/toggle-block', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.redirect('/admin/users');
    user.isBlocked = !user.isBlocked;
    await user.save();
    res.redirect('/admin/users');
  } catch (e) {
    console.error('toggle-block error', e);
    next(e);
  }
});

// ✅ Xóa tài khoản
router.post('/users/:id/delete', async (req, res, next) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.redirect('/admin/users');
  } catch (e) {
    console.error('delete user error', e);
    next(e);
  }
});


// DISCOUNTS (giữ nguyên)
router.get('/discounts', async (req, res, next) => {
  try {
    const discounts = await Discount.find({}).sort({ createdAt: -1 }).lean();

    // ✅ Thêm logic kiểm tra hiệu lực
    const today = new Date();
    discounts.forEach(d => {
      const start = d.startDate ? new Date(d.startDate) : null;
      const end = d.endDate ? new Date(d.endDate) : null;
      d.isValid = d.active && start && end && today >= start && today <= end;
    });

    res.render('admin-discounts', {
      title: 'Admin • Mã giảm giá',
      discounts,
      messages: req.flash ? req.flash() : {}
    });
  } catch (e) {
    next(e);
  }
});


// create, update, delete discounts (giữ nguyên các route từ bản trước)
router.post('/discounts', async (req, res, next) => {
  try {
    const rawCode = (req.body && (req.body.code || req.body.ma || req.body.MA || req.body.Mã)) ? String(req.body.code || req.body.ma || req.body.MA || req.body.Mã).trim() : '';
    const rawPercent = (req.body && (req.body.percent || req.body.phantram)) ? (req.body.percent || req.body.phantram) : null;
    const startDate = req.body && (req.body.startDate || req.body.tungay) ? (req.body.startDate || req.body.tungay) : null;
    const endDate = req.body && (req.body.endDate || req.body.denday) ? (req.body.endDate || req.body.denday) : null;
    const rawActive = req.body && (req.body.active === 'on' || req.body.active === 'true' || req.body.active === '1' || req.body.active === true);

    if (!rawCode) {
      if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
        return res.status(400).json({ message: 'Mã là bắt buộc' });
      }
      if (req.flash) req.flash('error', 'Mã là bắt buộc');
      return res.redirect('/admin/discounts');
    }

    const code = rawCode.toUpperCase();
    const percent = Number(rawPercent);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
        return res.status(400).json({ message: 'Phần trăm không hợp lệ (1-100)' });
      }
      if (req.flash) req.flash('error', 'Phần trăm không hợp lệ');
      return res.redirect('/admin/discounts');
    }

    const existing = await Discount.findOne({ code });
    if (existing) {
      if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
        return res.status(409).json({ message: 'Mã đã tồn tại' });
      }
      if (req.flash) req.flash('error', 'Mã đã tồn tại');
      return res.redirect('/admin/discounts');
    }

    const d = new Discount({
      code,
      percent,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      active: !!rawActive
    });
    await d.save();

    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
      return res.status(201).json({ discount: d });
    }
    if (req.flash) req.flash('success', 'Tạo mã thành công');
    res.redirect('/admin/discounts');
  } catch (e) {
    console.error('POST /admin/discounts error', e);
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
      return res.status(500).json({ message: 'Lỗi server khi tạo mã' });
    }
    next(e);
  }
});

router.post('/discounts/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const rawCode = (req.body && (req.body.code || req.body.ma || req.body.Mã)) ? String(req.body.code || req.body.ma || req.body.Mã).trim() : '';
    const rawPercent = (req.body && (req.body.percent || req.body.phantram)) ? (req.body.percent || req.body.phantram) : null;
    const startDate = req.body && (req.body.startDate || req.body.tungay) ? (req.body.startDate || req.body.tungay) : null;
    const endDate = req.body && (req.body.endDate || req.body.denday) ? (req.body.endDate || req.body.denday) : null;
    const rawActive = req.body && (req.body.active === 'on' || req.body.active === 'true' || req.body.active === '1');

    if (!rawCode) {
      if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
        return res.status(400).json({ message: 'Mã là bắt buộc' });
      }
      if (req.flash) req.flash('error', 'Mã là bắt buộc');
      return res.redirect('/admin/discounts');
    }
    const code = rawCode.toUpperCase();
    const percent = Number(rawPercent);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
        return res.status(400).json({ message: 'Phần trăm không hợp lệ (1-100)' });
      }
      if (req.flash) req.flash('error', 'Phần trăm không hợp lệ');
      return res.redirect('/admin/discounts');
    }

    const conflict = await Discount.findOne({ code, _id: { $ne: id } });
    if (conflict) {
      if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
        return res.status(409).json({ message: 'Mã đã tồn tại' });
      }
      if (req.flash) req.flash('error', 'Mã đã tồn tại');
      return res.redirect('/admin/discounts');
    }

    const update = {
      code,
      percent,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      active: !!rawActive
    };

    const updated = await Discount.findByIdAndUpdate(id, update, { new: true });
    if (!updated) {
      if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
        return res.status(404).json({ message: 'Không tìm thấy mã' });
      }
      if (req.flash) req.flash('error', 'Không tìm thấy mã');
      return res.redirect('/admin/discounts');
    }

    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
      return res.json({ discount: updated });
    }
    if (req.flash) req.flash('success', 'Cập nhật mã thành công');
    res.redirect('/admin/discounts');
  } catch (e) {
    console.error('POST /admin/discounts/:id error', e);
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
      return res.status(500).json({ message: 'Lỗi server khi cập nhật mã' });
    }
    next(e);
  }
});

router.post('/discounts/delete/:id', async (req, res) => {
  try {
    await Discount.findByIdAndDelete(req.params.id);
    res.redirect('/admin/discounts');
  } catch (error) {
    console.error(error);
    res.status(500).send('Lỗi khi xóa mã giảm giá');
  }
});

// GET trang chỉnh sửa
router.get('/discounts/edit/:id', async (req, res) => {
  const discount = await Discount.findById(req.params.id);
  res.render('admin-discount-edit', { discount });
});

// POST lưu chỉnh sửa
router.post('/discounts/edit/:id', async (req, res) => {
  try {
    const { code, percent, startDate, endDate, active } = req.body;

    await Discount.findByIdAndUpdate(req.params.id, {
      code,
      percent,
      startDate,
      endDate,
      active: active === 'true' // chuyển 'true'/'false' thành boolean thật
    });

    res.redirect('/admin/discounts');
  } catch (err) {
    console.error(err);
    res.status(500).send('Lỗi khi cập nhật mã giảm giá');
  }
});


// API xóa mã giảm giá (DELETE)
router.delete('/discounts/:id', async (req, res) => {
  try {
    await Discount.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Lỗi khi xóa mã giảm giá' });
  }
});



module.exports = router;
