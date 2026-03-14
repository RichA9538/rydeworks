import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI not set');
  process.exit(1);
}

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('Connected to MongoDB');

  // Dynamically import models
  const { Organization } = await import('@workspace/api-server/src/models/Organization.js' as any);
  const { User } = await import('@workspace/api-server/src/models/User.js' as any);
  const { Vehicle } = await import('@workspace/api-server/src/models/Vehicle.js' as any);

  // Create PERC org if not exists
  let org = await Organization.findOne({ slug: 'perc' });
  if (!org) {
    org = await Organization.create({
      name: 'PERC — People Empowering & Restoring Communities',
      slug: 'perc',
      email: 'dispatch@perc.org',
      phone: '(727) 000-0000',
      appName: 'PERC Transport',
      primaryColor: '#00D4C8',
      accentColor: '#0A1628',
      reportingPrefix: 'PER',
      homeBases: [
        { name: 'PERC St. Pete', address: '1523 16th St S, St. Petersburg, FL 33705', lat: 27.7731, lng: -82.6400, isDefault: true },
        { name: 'PERC Clearwater', address: '12810 US Hwy 19 N, Clearwater, FL 33764', lat: 27.9659, lng: -82.8001, isDefault: false }
      ],
      fareZones: [
        { name: 'Zone 1 - Local', minMiles: 0, maxMiles: 5, oneWayFare: 10, roundTripFare: 20 },
        { name: 'Zone 2 - City', minMiles: 5, maxMiles: 15, oneWayFare: 15, roundTripFare: 30 },
        { name: 'Zone 3 - County', minMiles: 15, maxMiles: 30, oneWayFare: 20, roundTripFare: 40 },
        { name: 'Zone 4 - Regional', minMiles: 30, maxMiles: null, oneWayFare: 30, roundTripFare: 60 }
      ]
    });
    console.log('✅ PERC organization created');
  } else {
    console.log('ℹ️  PERC organization already exists');
  }

  // Create super admin
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'rich@alvarezassociatesfl.com';
  const superAdminPass  = process.env.SUPER_ADMIN_PASSWORD || 'RydeWorks2024!';
  let superAdmin = await User.findOne({ email: superAdminEmail });
  if (!superAdmin) {
    await User.create({
      firstName: 'Rich', lastName: 'Alvarez',
      email: superAdminEmail,
      phone: '(727) 477-8909',
      password: superAdminPass,
      roles: ['super_admin', 'admin', 'dispatcher', 'driver'],
      organization: org._id,
      isActive: true, emailVerified: true
    });
    console.log('✅ Super admin created:', superAdminEmail);
  } else {
    console.log('ℹ️  Super admin already exists');
  }

  // Create initial PERC team
  const DEFAULT_PASS = 'ChangeMe123!';
  const teamMembers = [
    { firstName: 'Matt',   lastName: 'Lopez',   email: 'matt.lopez@perc.org',   roles: ['admin', 'dispatcher', 'driver'] },
    { firstName: 'Angela', lastName: 'Tutko',   email: 'angela.tutko@perc.org', roles: ['driver', 'dispatcher'] },
    { firstName: 'Gary',   lastName: 'Webb',    email: 'gary.webb@perc.org',    roles: ['driver'] },
    { firstName: 'Bruce',  lastName: 'Street',  email: 'bruce.street@perc.org', roles: ['driver'] }
  ];

  for (const member of teamMembers) {
    const exists = await User.findOne({ email: member.email });
    if (!exists) {
      await User.create({ ...member, password: DEFAULT_PASS, organization: org._id, isActive: true, emailVerified: true });
      console.log(`✅ User created: ${member.firstName} ${member.lastName}`);
    }
  }

  // Create vehicles
  const vehicleDefs = [
    { name: 'Van 1', licensePlate: 'VAN-001', make: 'Ford', model: 'Transit', year: 2022, capacity: 12,
      baseLocation: { name: 'PERC St. Pete', address: '1523 16th St S, St. Petersburg, FL 33705', lat: 27.7731, lng: -82.6400 } },
    { name: 'Van 2', licensePlate: 'VAN-002', make: 'Chevrolet', model: 'Express', year: 2021, capacity: 12,
      baseLocation: { name: 'PERC Clearwater', address: '12810 US Hwy 19 N, Clearwater, FL 33764', lat: 27.9659, lng: -82.8001 } }
  ];

  for (const vDef of vehicleDefs) {
    const exists = await Vehicle.findOne({ name: vDef.name, organization: org._id });
    if (!exists) {
      await Vehicle.create({ ...vDef, organization: org._id, status: 'available', isActive: true });
      console.log(`✅ Vehicle created: ${vDef.name}`);
    }
  }

  console.log('\n🎉 Seed complete!');
  console.log(`\nLogin credentials:`);
  console.log(`  Super Admin: ${superAdminEmail} / ${superAdminPass}`);
  console.log(`  Dispatcher:  matt.lopez@perc.org / ${DEFAULT_PASS}`);
  console.log(`  Driver:      gary.webb@perc.org / ${DEFAULT_PASS}`);
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
