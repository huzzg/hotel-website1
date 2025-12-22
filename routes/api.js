// routes/api.js
const express = require('express');
const router = express.Router();

const Room = require('../models/Room');
const Booking = require('../models/Booking');
const Discount = require('../models/Discount');

// helper to parse price string -> number (removes thousand separators . and handles commas)
function parsePriceParam(val) {
  if (val === undefined || val === null) return null;
  let s = String(val).trim();
  if (s === '') return null;
  // remove spaces
  s = s.replace(/\s+/g, '');
  // remove dots (thousand sep) and convert comma to dot if any
  if (s.indexOf('.') !== -1 && s.indexOf(',') !== -1) {
    s = s.replace(/\./g, '').replace(/,/g, '.');
  } else {
    s = s.replace(/\./g, '').replace(/,/g, '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * GET /search
 * Query params: q, type, min, max, checkIn, checkOut, sort
 * - If there is no meaningful query param, do not return rooms (page will ask user to search)
 * - Build a Mongo filter using provided params, and use numeric comparisons for price
 */
router.get('/search', async (req, res, next) => {
  try {
    const q = req.query.q ? String(req.query.q).trim() : '';
    const type = req.query.type ? String(req.query.type).trim() : '';
    const minRaw = req.query.min;
    const maxRaw = req.query.max;
    const checkIn = req.query.checkIn;
    const checkOut = req.query.checkOut;
    const sort = req.query.sort || '';

    // parse min/max to numbers
    const min = parsePriceParam(minRaw);
    const max = parsePriceParam(maxRaw);

    // determine if user actually searched (otherwise don't return results)
    const hasQuery = (q && q.length>0) || (type && type.length>0) || (min !== null) || (max !== null) || (checkIn && checkIn.length>0) || (checkOut && checkOut.length>0);

    let rooms = [];

    if (hasQuery) {
      const filter = {};

      // text search on name/type/roomNumber/description
      if (q) {
        const re = new RegExp(q.split(/\s+/).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
        filter.$or = [
          { type: re },
          { roomNumber: re },
          { description: re }
        ];
      }

      if (type) filter.type = type;

      if (min !== null || max !== null) {
        filter.price = {};
        if (min !== null) filter.price.$gte = min;
        if (max !== null) filter.price.$lte = max;
      }

      // optionally you can filter by availability using Booking collection and checkIn/checkOut
      // For now, we just return rooms matching basic filters. You can implement availability check later.
      let query = Room.find(filter).lean();

      // sorting
      if (sort === 'priceAsc') query = query.sort({ price: 1 });
      else if (sort === 'priceDesc') query = query.sort({ price: -1 });
      else if (sort === 'newest') query = query.sort({ createdAt: -1 });

      rooms = await query.exec();

      // Normalize image path for rendering convenience
      rooms = rooms.map(r => {
        if (r.image && typeof r.image === 'string') {
          if (r.image.length && r.image[0] !== '/') r.image = '/' + r.image;
        }
        return r;
      });
    }

    // render search view - pass through query values so form fields preserve values
    res.render('search', {
      title: 'Tìm phòng',
      rooms,
      q,
      type,
      min: minRaw,
      max: maxRaw,
      checkIn,
      checkOut,
      sort
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
