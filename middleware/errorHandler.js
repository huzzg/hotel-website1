// middleware/errorHandler.js
module.exports = (err, req, res, next) => {
  // In ra console để bạn thấy lỗi thực sự
  console.error('❌ Error:', err && (err.stack || err.message || err));
  if (res.headersSent) return next(err);

  const status = err.status || 500;

  // API -> trả JSON
  const wantsJson =
    req.xhr ||
    (req.headers.accept && req.headers.accept.includes('application/json'));

  if (wantsJson) {
    return res.status(status).json({ ok: false, error: err.message || 'Internal error' });
  }

  // View -> trả text có message (để bạn biết lỗi gì)
  res.status(status).send(`Something went wrong! ${err && err.message ? ' — ' + err.message : ''}`);
};
