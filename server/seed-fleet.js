#!/usr/bin/env node
// seed-fleet.js — Seeds Van 1, Van 2 and PERC home bases into the database
// Run: node server/seed-fleet.js

require('dotenv').config();
const mongoose = require('mongoose');
const Vehicle  = require('./models/Vehicle');
const Organization = require('./models/Organization');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Find PERC organization (first org in the system)
  const org = await Organization.findOne({});
  if (!org) {
    console.error('No organization found. Run the main seed first.');
    process.exit(1);
  }
  console.log(`Organization: ${org.name} (${org._id})`);

  // ── SEED VEHICLES ──────────────────────────────────────────
  const vehicleDefs = [
    {
      name: 'Van 1',
      licensePlate: 'VAN-001',
      make: 'Ford',
      model: 'Transit',
      year: 2022,
      capacity: 12,
      description: 'Primary transport van — PERC St. Pete',
      baseLocation: { name: 'PERC St. Pete', address: '1523 16th St S, St. Petersburg, FL 33705', lat: 27.7542, lng: -82.6537 },
      status: 'available',
      isActive: true,
      organization: org._id
    },
    {
      name: 'Van 2',
      licensePlate: 'VAN-002',
      make: 'Chevrolet',
      model: 'Express',
      year: 2021,
      capacity: 12,
      description: 'Secondary transport van — PERC Clearwater',
      baseLocation: { name: 'PERC Clearwater', address: '12810 US Hwy 19 N, Clearwater, FL 33764', lat: 27.8924, lng: -82.7265 },
      status: 'available',
      isActive: true,
      organization: org._id
    }
  ];

  for (const vDef of vehicleDefs) {
    const existing = await Vehicle.findOne({ name: vDef.name, organization: org._id });
    if (existing) {
      console.log(`  Vehicle "${vDef.name}" already exists — skipping.`);
    } else {
      const v = new Vehicle(vDef);
      await v.save();
      console.log(`  Created vehicle: ${vDef.name}`);
    }
  }

  // ── SEED HOME BASES ────────────────────────────────────────
  const homeBases = org.homeBases || [];
  const percStPete = {
    name: 'PERC St. Pete',
    address: '1523 16th St S, St. Petersburg, FL 33705',
    lat: 27.7731,
    lng: -82.6400,
    isDefault: false
  };
  const percClearwater = {
    name: 'PERC Clearwater',
    address: '12810 US Hwy 19 N, Clearwater, FL 33764',
    lat: 27.9659,
    lng: -82.8001,
    isDefault: false
  };

  let changed = false;
  if (!homeBases.find(b => b.name === 'PERC St. Pete')) {
    // Make sure only one default
    if (percStPete.isDefault) homeBases.forEach(b => b.isDefault = false);
    homeBases.push(percStPete);
    console.log('  Added home base: PERC St. Pete');
    changed = true;
  } else {
    console.log('  Home base "PERC St. Pete" already exists — skipping.');
  }

  if (!homeBases.find(b => b.name === 'PERC Clearwater')) {
    homeBases.push(percClearwater);
    console.log('  Added home base: PERC Clearwater');
    changed = true;
  } else {
    console.log('  Home base "PERC Clearwater" already exists — skipping.');
  }

  if (changed) {
    org.homeBases = homeBases;
    await org.save();
    console.log('  Organization home bases saved.');
  }

  console.log('\nSeed complete!');
  process.exit(0);
}

main().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
