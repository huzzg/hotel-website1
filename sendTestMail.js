// sendTestMail.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'hungnguyenviete@gmail.com',   // 👉 Thay bằng Gmail của bạn
    pass: 'vhjmsasjijipfiji'   // 👉 Dán App Password (16 ký tự)
  }
});

transporter.sendMail({
  from: 'youremail@gmail.com',
  to: 'hungnguyenviete@gmail.com',            // 👉 Nhập Gmail bạn muốn nhận thử
  subject: 'Kiểm tra gửi mail Node.js',
  text: 'Gửi thử thành công!'
})
.then(() => console.log('✅ Gửi thành công'))
.catch(console.error);
