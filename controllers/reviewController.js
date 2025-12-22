const Room = require("../models/Room");
const Review = require("../models/Review");

exports.getRoomReviews = async (req, res) => {
  try {
    const roomId = req.params.roomId;

    // ✅ Lấy phòng theo ID
    const room = await Room.findById(roomId)
    .select("roomNumber type image description")
    .lean();

    if (!room) {
      return res.render("error", {
        message: "Không tìm thấy thông tin phòng.",
        redirectUrl: "/user/history",
      });
    }

    // ✅ Tên phòng hiển thị
    const roomDisplayName =
  (room.type
    ? `${room.type} - Phòng ${room.roomNumber}`
    : `Phòng ${room.roomNumber}`) || "Phòng không xác định";

    // ✅ Lấy tất cả đánh giá của phòng
    const reviews = await Review.find({ room: roomId })
      .populate("user", "username avatar")
      .lean();

    // ✅ Lấy thông tin người dùng hiện tại
    const currentUser = res.locals.currentUser || null;

    // ✅ Render view
    res.render("review", {
      title: `Đánh giá phòng: ${roomDisplayName}`,
      room,
      reviews,
      currentUser,
      roomDisplayName,
    });
  } catch (err) {
    console.error("❌ Lỗi khi tải trang đánh giá:", err);
    res.render("error", {
      message: "Đã xảy ra lỗi khi tải trang đánh giá.",
      redirectUrl: "/user/history",
    });
  }
};

exports.createReview = async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const { rating, comment } = req.body;
    const user = req.session.user;

    if (!user) {
      return res.status(401).send("Vui lòng đăng nhập để đánh giá.");
    }

    // Kiểm tra phòng có tồn tại không
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).send("Không tìm thấy phòng.");
    }

    // Tạo đánh giá mới
    const review = new Review({
      room: roomId,
      user: user._id,
      rating,
      comment,
      createdAt: new Date(),
    });

    await review.save();

    // Quay lại trang đánh giá
    res.redirect(`/review/${roomId}`);
  } catch (error) {
    console.error("Lỗi khi gửi đánh giá:", error);
    res.status(500).send("Đã xảy ra lỗi khi gửi đánh giá.");
  }
};

// ✅ Gửi đánh giá
exports.addReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const user = res.locals.currentUser;

    if (!user) {
      return res.redirect("/auth/login");
    }

    await Review.create({
      user: user._id,
      room: req.params.roomId,
      rating,
      comment,
    });

    res.redirect(`/review/${req.params.roomId}`);
  } catch (err) {
    console.error("❌ Lỗi khi gửi đánh giá:", err);
    res.redirect("/user/history");
  }
};
