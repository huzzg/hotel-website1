// middleware/requireAdmin.js
module.exports = (req, res, next) => {
  try {
    const user = req.session?.user;

    // ✅ Ghi log để debug
    console.log('🧩 [requireAdmin] Session user:', user);

    if (!user) {
      console.warn('⚠️ Không có user trong session, chuyển hướng về login');
      return res.redirect('/auth/login');
    }

    if (user.role !== 'admin') {
      console.warn(`⚠️ Người dùng không có quyền admin: ${user.username} (${user.role})`);
      return res.status(403).render('errors/403', {
        title: '403 - Không có quyền truy cập',
        message: 'Bạn không có quyền truy cập vào khu vực quản trị.'
      });
    }

    // ✅ Nếu đúng quyền admin
    res.locals.currentUser = user;
    next();

  } catch (err) {
    console.error('❌ Lỗi trong requireAdmin middleware:', err);
    res.status(500).send('Lỗi kiểm tra quyền admin.');
  }
};
