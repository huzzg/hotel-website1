const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController")
const { requireAuth } = require("../middleware/authMiddleware");
const { getRoomReviews, addReview } = require("../controllers/reviewController");
const { createReview } = require("../controllers/reviewController");

// Middleware kiểm tra đăng nhập an toàn hơn
function ensureAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  } else {
    req.flash("error", "Bạn cần đăng nhập để đánh giá phòng!");
    return res.redirect("/auth/login");
  }
}

// Trang xem đánh giá phòng (cho phép khách truy cập)
router.get("/:roomId", getRoomReviews)

// Gửi đánh giá phòng (chỉ cho người đã đăng nhập)
router.get("/:roomId", requireAuth, getRoomReviews);

// Gửi đánh giá
router.post("/:roomId", requireAuth, createReview);

module.exports = router;
