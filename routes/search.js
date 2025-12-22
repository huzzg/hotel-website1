// routes/search.js
const express = require('express');
const router = express.Router();

const Room = require('../models/Room');
const Booking = require('../models/Booking');
const Discount = require('../models/Discount');
const isRoomAvailable = require('../utils/checkRoomAvailability');

// helper to parse price param strings -> number (handle "250.000" / "250,5" / "250000")
function parsePriceParam(val) {
  if (val === undefined || val === null) return null;
  let s = String(val).trim();
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

// GET /search
router.get('/', async (req, res, next) => {
  try {
    // read raw query params (strings)
    const q = typeof req.query.q !== 'undefined' ? String(req.query.q).trim() : '';
    const type = typeof req.query.type !== 'undefined' ? String(req.query.type).trim() : '';
    const minRaw = typeof req.query.min !== 'undefined' ? String(req.query.min).trim() : '';
    const maxRaw = typeof req.query.max !== 'undefined' ? String(req.query.max).trim() : '';
    const checkIn = typeof req.query.checkIn !== 'undefined' ? String(req.query.checkIn).trim() : '';
    const checkOut = typeof req.query.checkOut !== 'undefined' ? String(req.query.checkOut).trim() : '';
    const sort = typeof req.query.sort !== 'undefined' ? String(req.query.sort).trim() : '';

    // parse numeric min/max for query
    const min = parsePriceParam(minRaw);
    const max = parsePriceParam(maxRaw);

    // decide if user actually searched (otherwise we won't return rooms)
    const hasQuery = (q && q.length > 0) || (type && type.length > 0) || (min !== null) || (max !== null) || (checkIn && checkIn.length > 0) || (checkOut && checkOut.length > 0);

    let rooms = [];

    if (hasQuery) {
      const filter = {};

      if (q) {
        // basic regex search on roomNumber/type/description
        const terms = q.split(/\s+/).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const re = new RegExp(terms.join('|'), 'i');
        filter.$or = [
          { type: re },
          { roomNumber: re },
          { description: re }
        ];
      }

      if (type) {
  filter.type = { $regex: new RegExp(`^${type}$`, 'i') }; // so khớp không phân biệt hoa/thường
}


      if (min !== null || max !== null) {
        filter.price = {};
        if (min !== null) filter.price.$gte = min;
        if (max !== null) filter.price.$lte = max;
      }

      // build query
      let qBuilder = Room.find(filter).lean();

      if (sort === 'priceAsc') qBuilder = qBuilder.sort({ price: 1 });
      else if (sort === 'priceDesc') qBuilder = qBuilder.sort({ price: -1 });
      else if (sort === 'newest') qBuilder = qBuilder.sort({ createdAt: -1 });

      rooms = await qBuilder.exec();

      // normalize image path (ensure leading slash)
      rooms = rooms.map(r => {
        if (r && r.image && typeof r.image === 'string') {
          if (r.image.length && r.image[0] !== '/') r.image = '/' + r.image;
        }
        return r;
      });

      // If user provided checkIn/checkOut, annotate availability for that range
      if (checkIn && checkOut && isRoomAvailable) {
        // For each room call utility to test overlap. Note: this issues one query per room.
        const annotated = await Promise.all(rooms.map(async (r) => {
          try {
            const ok = await isRoomAvailable(r._id, checkIn, checkOut);
            return { ...r, isAvailableForRange: !!ok };
          } catch (e) {
            // on error, treat as available to avoid hiding rooms unexpectedly
            return { ...r, isAvailableForRange: true };
          }
        }));
        rooms = annotated;
      } else {
        // If user didn't select dates, annotate isAvailableForRange undefined (views can fallback to isAvailableToday or true)
        rooms = rooms.map(r => ({ ...r, isAvailableForRange: undefined }));
      }
    }

    // render with default variables so template never gets undefined
    res.render('search', {
      title: 'Tìm phòng',
      rooms: rooms || [],
      q: q || '',
      type: type || '',
      min: minRaw || '',
      max: maxRaw || '',
      checkIn: checkIn || '',
      checkOut: checkOut || '',
      sort: sort || ''
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
