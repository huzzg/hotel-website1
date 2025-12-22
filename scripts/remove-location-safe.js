// scripts/remove-location-safe.js
// Sửa để tương thích với mongodb driver hiện tại (bỏ các option không còn hỗ trợ).
const { MongoClient } = require('mongodb');
const fs = require('fs');
require('dotenv').config();

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGO_DB || 'hoteldb';

(async () => {
  const client = new MongoClient(uri); // <-- không truyền { useUnifiedTopology: true }
  try {
    await client.connect();
    const db = client.db(dbName);

    // rooms
    const rooms = db.collection('rooms');
    const docs = await rooms.find({ location: { $exists: true } }).toArray();
    console.log('Rooms with location:', docs.length);
    if (docs.length > 0) {
      fs.writeFileSync('rooms-with-location.json', JSON.stringify(docs, null, 2));
      console.log('Exported rooms-with-location.json');
      const res = await rooms.updateMany({}, { $unset: { location: "" } });
      console.log('Unset location in rooms. modifiedCount:', res.modifiedCount);
    } else {
      console.log('No location field found in rooms.');
    }

    // bookings (if exists)
    const colls = await db.listCollections().toArray();
    if (colls.find(c => c.name === 'bookings')) {
      const bookings = db.collection('bookings');
      const bdocs = await bookings.find({ location: { $exists: true } }).toArray();
      if (bdocs.length) {
        fs.writeFileSync('bookings-with-location.json', JSON.stringify(bdocs, null, 2));
        await bookings.updateMany({}, { $unset: { location: "" } });
        console.log('Unset location in bookings.');
      }
    }

    await client.close();
    console.log('Done.');
  } catch (err) {
    console.error('Migration error:', err);
    try { await client.close(); } catch(e){}
    process.exit(1);
  }
})();
