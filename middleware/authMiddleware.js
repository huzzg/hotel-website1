// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * attachUser: cố gắng lấy thông tin user theo thứ tự:
 * 1) req.session.user
 * 2) req.session.passport.user  (nếu bạn dùng passport)
 * 3) req.session.currentUser
 * 4) cookie token JWT (decode)
 * Sau đó đặt req.user và res.locals.currentUser
 */
async function attachUser(req, res, next) {
  try {
    req.user = null;
    res.locals.currentUser = null;

    // 1) session.user (ưu tiên)
    if (req.session && req.session.user) {
      req.user = req.session.user;
      res.locals.currentUser = req.user;
      return next();
    }

    // 2) Passport default (nếu bạn dùng passport)
    if (req.session && req.session.passport && req.session.passport.user) {
      const u = req.session.passport.user;
      if (typeof u === 'object' && (u._id || u.id)) {
        req.user = u;
        res.locals.currentUser = req.user;
        return next();
      }
      try {
        const found = await User.findById(u).lean();
        if (found) {
          req.user = {
            id: found._id,
            username: found.username || found.email,
            role: found.role || 'user',
            email: found.email || '',
            name: found.profile?.name || ''
          };
          res.locals.currentUser = req.user;
          return next();
        }
      } catch (e) {}
    }

    // 3) other possible session keys (safe checks)
    if (req.session && req.session.currentUser) {
      req.user = req.session.currentUser;
      res.locals.currentUser = req.user;
      return next();
    }

    // 4) fallback: token from cookie or Authorization header
    const bearer = req.headers['authorization'];
    const token = req.cookies?.token || (bearer && bearer.startsWith('Bearer ') ? bearer.slice(7) : null);

    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = {
          id: payload.id || payload._id,
          role: payload.role || 'user',
          email: payload.email || '',
          username: payload.username || payload.email || '',
          name: payload.name || payload.username || ''
        };
        res.locals.currentUser = req.user;
        return next();
      } catch (err) {
        try { res.clearCookie('token', { httpOnly: true, sameSite: 'lax' }); } catch(e){}
        req.user = null;
      }
    }

    req.user = null;
    res.locals.currentUser = null;
    return next();
  } catch (err) {
    console.error('attachUser error:', err);
    req.user = null;
    res.locals.currentUser = null;
    return next();
  }
}

/**
 * requireAuth middleware:
 * - Nếu req.user (attachUser) đã set thì next()
 * - Nếu không: redirect /auth/login
 */
function requireAuth(req, res, next) {
  if (req.user) return next();
  const OPEN = ['/', '/search', '/auth/login', '/auth/register', '/auth/logout'];
  if (OPEN.includes(req.path) || OPEN.some(p => (p instanceof RegExp && p.test(req.path)))) return next();
  if (req.session) req.session.returnTo = req.originalUrl || '/';
  return res.redirect('/auth/login');
}

module.exports = { attachUser, requireAuth };
