#!/usr/bin/env node
// dedup-users.js — One-time script to deactivate duplicate active user records
// Run: node server/dedup-users.js

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const users = await User.find({}).sort({ createdAt: 1 }); // oldest first

  // Group by email
  const byEmail = {};
  for (const u of users) {
    const key = u.email.toLowerCase().trim();
    if (!byEmail[key]) byEmail[key] = [];
    byEmail[key].push(u);
  }

  let deactivated = 0;
  for (const [email, group] of Object.entries(byEmail)) {
    if (group.length < 2) continue;

    // Keep the first (oldest/seed) active record, deactivate the rest
    const [keep, ...dupes] = group;
    console.log(`Duplicate found: ${keep.firstName} ${keep.lastName} (${email})`);
    console.log(`  Keeping:     _id ${keep._id} (created ${keep.createdAt?.toISOString().split('T')[0]})`);

    for (const dupe of dupes) {
      console.log(`  Deactivating: _id ${dupe._id} (created ${dupe.createdAt?.toISOString().split('T')[0]})`);
      dupe.isActive = false;
      await dupe.save();
      deactivated++;
    }
  }

  console.log(`\nDone. ${deactivated} duplicate(s) deactivated.`);
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
