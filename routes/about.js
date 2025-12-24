const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

// Hiển thị trang giới thiệu
router.get('/', (req, res) => {
  res.render('about', { user: req.session.user });
});

// Xử lý gửi ý kiến
router.post('/feedback', async (req, res) => {
  const { name, email, message } = req.body;

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: `"${name}" <${email || 'noreply@phenikaa.vn'}>`,
      to: process.env.EMAIL_USER, // mail hệ thống admin
      subject: `Ý kiến từ khách hàng ${name}`,
      html: `
        <h3>Phản hồi khách hàng mới</h3>
        <p><b>Người gửi:</b> ${name}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Nội dung:</b></p>
        <p>${message}</p>
      `
    });

    res.render('about', {
      user: req.session.user,
      success: '✅ Cảm ơn bạn đã gửi ý kiến! Chúng tôi sẽ phản hồi sớm nhất có thể.'
    });
  } catch (err) {
    console.error('❌ Lỗi gửi ý kiến:', err);
    res.render('about', {
      user: req.session.user,
      error: '❌ Gửi ý kiến thất bại. Vui lòng thử lại sau.'
    });
  }
});

module.exports = router;
