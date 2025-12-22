// utils/checkRoomAvailability.js
// Trả về true nếu phòng available cho range [checkIn, checkOut), false nếu có booking overlap.
// LƯU Ý: chỉ coi một số status là "chiếm phòng" (blocking): pending, paid, checked_in
// Những status như 'cancelled', 'checked_out', 'completed' thì không chặn.

const Booking = require('../models/Booking');

function toDateStart(d) {
  if (!d) return null;
  const dt = (d instanceof Date) ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

module.exports = async function isRoomAvailable(roomId, checkIn, checkOut) {
  if (!roomId) {
    throw new Error('roomId is required');
  }

  // Parse dates (local)
  let start = toDateStart(checkIn);
  let end = toDateStart(checkOut);

  if (!start) {
    const now = new Date();
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  }
  if (!end) {
    end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  }

  if (!(start instanceof Date) || !(end instanceof Date) || isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid checkIn/checkOut date');
  }
  if (start >= end) {
    // empty/invalid range -> treat as not available (safer)
    return false;
  }

  // Only bookings with these statuses will block the room:
  const blockingStatuses = ['pending', 'paid', 'checked_in'];

  try {
    const overlapping = await Booking.findOne({
      roomId: roomId,
      status: { $in: blockingStatuses },
      $and: [
        { checkIn: { $lt: end } },
        { checkOut: { $gt: start } }
      ]
    }).lean();

    return !overlapping;
  } catch (err) {
    console.error('checkRoomAvailability error:', err);
    // nếu DB lỗi, trả true để tránh vô tình ẩn phòng — bạn có thể đổi thành false nếu muốn an toàn hơn
    return true;
  }
};
