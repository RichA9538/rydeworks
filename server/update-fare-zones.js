// One-time script to update fare zones in MongoDB
// Run with: node server/update-fare-zones.js
require('dotenv').config();
const mongoose = require('mongoose');
const Organization = require('./models/Organization');

const FARE_ZONES = [
  {
    name: 'Zone 1 — Local',
    description: 'Very short trips within same city (0–5 miles)',
    minMiles: 0,
    maxMiles: 5,
    oneWayFare: 9.00,
    roundTripFare: 18.00
  },
  {
    name: 'Zone 2 — Short',
    description: 'Within greater city area (5–10 miles)',
    minMiles: 5,
    maxMiles: 10,
    oneWayFare: 10.00,
    roundTripFare: 20.00
  },
  {
    name: 'Zone 3 — Medium',
    description: 'Cross-Pinellas, typical commute (10–15 miles)',
    minMiles: 10,
    maxMiles: 15,
    oneWayFare: 10.00,
    roundTripFare: 20.00
  },
  {
    name: 'Zone 4 — Long',
    description: 'Longer in-county trips (15–20 miles)',
    minMiles: 15,
    maxMiles: 20,
    oneWayFare: 11.00,
    roundTripFare: 22.00
  },
  {
    name: 'Zone 5 — County Edge',
    description: 'Near county limits (20–25 miles)',
    minMiles: 20,
    maxMiles: 25,
    oneWayFare: 12.00,
    roundTripFare: 24.00
  },
  {
    name: 'Hillsborough County',
    description: 'Tampa area cross-county (25–35 miles)',
    minMiles: 25,
    maxMiles: 35,
    oneWayFare: 18.00,
    roundTripFare: 36.00
  },
  {
    name: 'Pasco / Manatee County',
    description: 'North or south cross-county (35–45 miles)',
    minMiles: 35,
    maxMiles: 45,
    oneWayFare: 20.00,
    roundTripFare: 40.00
  },
  {
    name: 'Extended Service Area',
    description: 'Beyond 45 miles',
    minMiles: 45,
    maxMiles: null,
    oneWayFare: 25.00,
    roundTripFare: 50.00
  }
];

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const orgs = await Organization.find({});
  if (orgs.length === 0) {
    console.log('No organizations found.');
    process.exit(1);
  }

  for (const org of orgs) {
    org.fareZones = FARE_ZONES;
    await org.save();
    console.log(`Updated fare zones for org: ${org.name || org._id}`);
  }

  console.log('Done.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
