require('dotenv').config();
const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const path       = require('path');
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

// Models (register with mongoose)
require('./models/Organization');
require('./models/User');
require('./models/Vehicle');
require('./models/Trip');
require('./models/Rider');
require('./models/AccessCode');
require('./models/Grant');
require('./models/Partner');
require('./models/RiderSubscription');

// Routes
const authRoutes       = require('./routes/auth');
const adminRoutes      = require('./routes/admin');
const reportRoutes     = require('./routes/reports');
const tripRoutes       = require('./routes/trips');
const superAdminRoutes = require('./routes/superAdmin');
const bookRoutes       = require('./routes/book');

const app = express();
app.set('trust proxy', 1); // Trust Railway's reverse proxy for correct IP detection

// ── Security ──────────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: false
}));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    // Allow rydeworks.com and all subdomains (perc.rydeworks.com, etc.)
    if (/^https?:\/\/(.*\.)?rydeworks\.com$/.test(origin)) return callback(null, true);
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, error: 'Too many requests, please try again later.' }
}));

// ── Body parsing ──────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Static frontend ───────────────────────────────────────
app.use(express.static(path.join(__dirname, '../client/public')));

// ── API Routes ────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/admin',       adminRoutes);
app.use('/api/reports',     reportRoutes);
app.use('/api/trips',       tripRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/book',        bookRoutes);

app.get('/api/health', (req, res) => res.json({
  success: true,
  message: 'RydeWorks API is running',
  timestamp: new Date().toISOString(),
  env: process.env.NODE_ENV || 'development'
}));

// Public config — exposes non-secret client-side keys
app.get('/api/config', (req, res) => res.json({
  mapboxToken: process.env.MAPBOX_TOKEN || ''
}));

// ── Demo request endpoint ────────────────────────────────
app.post('/api/demo-request', async (req, res) => {
  try {
    const { name, organization, email, phone, volume } = req.body;
    console.log(`📋 DEMO REQUEST: ${name} | ${organization} | ${email} | ${phone} | ${volume}`);

    // Send email notification to Rich if Resend is configured
    if (process.env.RESEND_API_KEY) {
      resend.emails.send({
        from: 'Rydeworks <noreply@rydeworks.com>',
        to: 'rich@alvarezassociatesfl.com',
        subject: `New Demo Request — ${organization}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#0A1628;padding:24px;border-radius:8px 8px 0 0">
              <h2 style="color:#00D4C8;margin:0;font-size:1.4rem">New Demo Request</h2>
              <p style="color:rgba(255,255,255,0.6);margin:4px 0 0;font-size:0.9rem">via Rydeworks.com</p>
            </div>
            <div style="background:#f8f9fa;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0">
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:8px 0;color:#718096;font-size:0.85rem;width:140px">Name</td><td style="padding:8px 0;font-weight:600;color:#1a202c">${name}</td></tr>
                <tr><td style="padding:8px 0;color:#718096;font-size:0.85rem">Organization</td><td style="padding:8px 0;font-weight:600;color:#1a202c">${organization}</td></tr>
                <tr><td style="padding:8px 0;color:#718096;font-size:0.85rem">Email</td><td style="padding:8px 0"><a href="mailto:${email}" style="color:#00B4AA">${email}</a></td></tr>
                <tr><td style="padding:8px 0;color:#718096;font-size:0.85rem">Phone</td><td style="padding:8px 0;color:#1a202c">${phone || 'Not provided'}</td></tr>
                <tr><td style="padding:8px 0;color:#718096;font-size:0.85rem">Rides/Week</td><td style="padding:8px 0;color:#1a202c">${volume || 'Not specified'}</td></tr>
              </table>
              <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0">
                <a href="mailto:${email}?subject=Re: Rydeworks Demo Request" style="background:#00D4C8;color:#0A1628;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700;font-size:0.9rem">Reply to ${name}</a>
              </div>
            </div>
          </div>
        `
      }).catch(err => {
        console.error('❌ Demo request email failed:', err.message);
      });
    } else {
      console.log('⚠️  RESEND_API_KEY not set — demo request logged only');
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Demo request error:', err);
    res.json({ success: false });
  }
});

// ── Serve frontend for all non-API routes ─────────────────
// Root / — serve landing page on rydeworks.com, smart redirect on app.rydeworks.com
app.get('/', (req, res) => {
  const host = req.hostname || '';
  const isRootDomain = host === 'rydeworks.com' || host === 'www.rydeworks.com';
  if (isRootDomain) {
    res.sendFile(path.join(__dirname, '../client/public/landing.html'));
  } else {
    res.sendFile(path.join(__dirname, '../client/public/redirect.html'));
  }
});

// /enroll also serves the public landing/enrollment page
app.get('/enroll', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/public/landing.html'));
});

// /book serves the rider self-booking page (works on any subdomain)
app.get('/book', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/public/book.html'));
});

// /privacy serves the privacy policy
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/public/privacy.html'));
});

// /reset-password serves the password reset page
app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/public/reset-password.html'));
});

// /app and everything else serves the dispatch app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/public/app.html'));
});

// ── Error handling ────────────────────────────────────────
app.use((req, res) => res.status(404).json({ success: false, error: 'Route not found.' }));
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error.' : err.message
  });
});

// ── Database + Start ──────────────────────────────────────
const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    if (process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('✅ Connected to MongoDB');

      // One-time migration: drop the stale unique index on Rider.anonymousId
      // This field is no longer set on new riders; the unique constraint causes
      // E11000 errors when creating a second rider without an anonymousId.
      try {
        const Rider = require('./models/Rider');
        await Rider.collection.dropIndex('anonymousId_1');
        console.log('✅ Dropped stale anonymousId unique index on riders');
      } catch (e) {
        // Index may not exist (already dropped or never created) — that's fine
        if (e.code !== 27) console.warn('⚠️  Could not drop anonymousId index:', e.message);
      }

      await seedInitialData();
    } else {
      console.log('⚠️  No MONGODB_URI — running without database');
    }

    app.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════════════════════════╗
║          🚐  RydeWorks — Dispatch Platform  🚐             ║
║   Server: http://localhost:${PORT}                          ║
║   API:    http://localhost:${PORT}/api                      ║
╚═══════════════════════════════════════════════════════════╝`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
};

// ── Seed initial PERC data ────────────────────────────────
const seedInitialData = async () => {
  const Organization = require('./models/Organization');
  const User         = require('./models/User');
  const Vehicle      = require('./models/Vehicle');

  // Create PERC org if it doesn't exist
  let org = await Organization.findOne({ slug: 'perc' });
  if (!org) {
    org = await Organization.create({
      name: 'PERC - People Empowering & Restoring Communities',
      slug: 'perc',
      email: 'rich@alvarezassociatesfl.com',
      phone: '(727) 477-8909',
      appName: 'Zak Transportation Initiative',
      primaryColor: '#2E7D32',
      accentColor: '#FFC107',
      homeBases: [
        {
          name: 'PERC St. Pete',
          address: '1523 16th St S, St. Petersburg, FL 33705',
          lat: 27.7542,
          lng: -82.6537,
          isDefault: false
        },
        {
          name: 'PERC Clearwater',
          address: '12810 US Hwy 19 N, Clearwater, FL 33764',
          lat: 27.8924,
          lng: -82.7265,
          isDefault: false
        }
      ],
      fareZones: [
        { name: 'Zone 1', description: 'Core South/Central St. Pete (South St. Pete, Downtown, Midtown)', minMiles: 0, maxMiles: 6, roundTripFare: 18, oneWayFare: 9 },
        { name: 'Zone 2', description: 'Greater St. Pete / South Pinellas (Gulfport, Pinellas Park, Kenneth City)', minMiles: 6, maxMiles: 12, roundTripFare: 20, oneWayFare: 10 },
        { name: 'Zone 3', description: 'Central Pinellas (Largo, Clearwater, parts of Seminole/Safety Harbor)', minMiles: 12, maxMiles: 18, roundTripFare: 22, oneWayFare: 11 },
        { name: 'Zone 4', description: 'North Pinellas - north of Ulmerton (Dunedin, Palm Harbor, Tarpon Springs, Oldsmar)', minMiles: 18, maxMiles: null, roundTripFare: 25, oneWayFare: 13 },
        { name: 'Out-of-County', description: 'Hillsborough $32 / Pasco $36 / Hernando/Manatee/Sarasota $40', minMiles: 999, maxMiles: null, roundTripFare: 36, oneWayFare: 18, notes: 'Priced case-by-case within range' }
      ],
      partnerRates: [
        { name: 'Half-day Zone 1-2', blockHours: 4, zoneLabel: 'Zone 1-2', price: 320 },
        { name: 'Half-day Zone 3',   blockHours: 4, zoneLabel: 'Zone 3',   price: 360 },
        { name: 'Half-day Zone 4',   blockHours: 4, zoneLabel: 'Zone 4',   price: 420 },
        { name: 'Half-day Out-of-county', blockHours: 4, zoneLabel: 'Out-of-county', price: 480, priceMax: 560 },
        { name: 'Full-day Zone 1-2', blockHours: 8, zoneLabel: 'Zone 1-2', price: 600 },
        { name: 'Full-day Zone 3',   blockHours: 8, zoneLabel: 'Zone 3',   price: 680 },
        { name: 'Full-day Zone 4',   blockHours: 8, zoneLabel: 'Zone 4',   price: 780 },
        { name: 'Full-day Out-of-county', blockHours: 8, zoneLabel: 'Out-of-county', price: 880, priceMax: 1040 }
      ],
      plan: 'professional'
    });

    console.log('✅ PERC organization created');
  }

  // Keep demo PERC locations current if they already exist
  let orgTouched = false;
  if (org?.homeBases?.length) {
    for (const b of org.homeBases) {
      if (b.name === 'PERC St. Pete') {
        if (b.address !== '1523 16th St S, St. Petersburg, FL 33705' || b.lat !== 27.7542 || b.lng !== -82.6537 || b.isDefault) {
          b.address = '1523 16th St S, St. Petersburg, FL 33705';
          b.lat = 27.7542;
          b.lng = -82.6537;
          b.isDefault = false;
          orgTouched = true;
        }
      }
      if (b.name === 'PERC Clearwater') {
        if (b.address !== '12810 US Hwy 19 N, Clearwater, FL 33764' || b.lat !== 27.8924 || b.lng !== -82.7265) {
          b.address = '12810 US Hwy 19 N, Clearwater, FL 33764';
          b.lat = 27.8924;
          b.lng = -82.7265;
          orgTouched = true;
        }
      }
    }
  }
  if (orgTouched) {
    await org.save();
    console.log('✅ Updated stored PERC base addresses');
  }

  // Create vehicles
  const van1 = await Vehicle.findOne({ organization: org._id, name: 'Van 1' });
  if (!van1) {
    await Vehicle.create([
      { organization: org._id, name: 'Van 1', make: 'Chevrolet', model: 'Express', capacity: 7, status: 'available', baseLocation: { name: 'PERC St. Pete', address: '1523 16th St S, St. Petersburg, FL 33705', lat: 27.7531, lng: -82.6652 } },
      { organization: org._id, name: 'Van 2', make: 'Chevrolet', model: 'Express', capacity: 7, status: 'available', baseLocation: { name: 'PERC Clearwater', address: '12810 US Hwy 19 N, Clearwater, FL 33764', lat: 27.8898, lng: -82.7275 } }
    ]);
    console.log('✅ Vehicles created');
  }


  // Create super admin (Rich)
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'rich@alvarezassociatesfl.com';
  const superAdminPass  = process.env.SUPER_ADMIN_PASSWORD;
  if (superAdminPass) {
    const existing = await User.findOne({ email: superAdminEmail });
    if (!existing) {
      await User.create({
        firstName: 'Rich', lastName: 'Alvarez',
        email: superAdminEmail,
        phone: '(727) 477-8909',
        password: superAdminPass,
        roles: ['super_admin', 'admin', 'dispatcher', 'driver'],
        organization: org._id,
        isActive: true, emailVerified: true
      });
      console.log('✅ Super admin (Rich Alvarez) created');
    }
  }

  // Remove demo user if it was accidentally created in a previous deploy
  await User.deleteOne({ email: 'demo@rydeworks.com' }).catch(() => {});

  // Create initial team — default password: ChangeMe123! (must change on first login)
  const DEFAULT_PASS = 'ChangeMe123!';
  const teamMembers = [
    { firstName: 'Matt',   lastName: 'Lopez',   email: 'matt.lopez@perc.org',   phone: '', roles: ['admin', 'dispatcher', 'driver'] },
    { firstName: 'Angela', lastName: 'Tutko',   email: 'angela.tutko@perc.org', phone: '', roles: ['driver', 'dispatcher'] },
    { firstName: 'Gary',   lastName: 'Webb',    email: 'gary.webb@perc.org',    phone: '', roles: ['driver'] },
    { firstName: 'Bruce',  lastName: 'Street',  email: 'bruce.street@perc.org', phone: '', roles: ['driver'] }
  ];

  for (const member of teamMembers) {
    const exists = await User.findOne({
      organization: org._id,
      firstName: member.firstName,
      lastName: member.lastName
    });
    if (!exists) {
      await User.create({
        ...member,
        password: DEFAULT_PASS,
        organization: org._id,
        isActive: true,
        emailVerified: true
      });
      console.log(`✅ User created: ${member.firstName} ${member.lastName}`);
    }
  }
};

// ── Weekly Friday billing ─────────────────────────────────
const { runWeeklyBilling, expireFreeRideCodes } = require('./billing');
// Schedule: run every Friday at 6 AM Eastern
function scheduleWeeklyBilling() {
  setInterval(async () => {
    const now = new Date();
    const estHour = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }).format(now));
    const estDay = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(now);
    const estMin = now.getMinutes();
    // Expire free ride codes every check (idempotent — only affects codes past their date)
    await expireFreeRideCodes().catch(err => console.error('Expire codes error:', err));
    if (estDay === 'Fri' && estHour === 6 && estMin < 5) {
      console.log('Running weekly Friday billing...');
      await runWeeklyBilling().catch(err => console.error('Billing error:', err));
    }
  }, 5 * 60 * 1000); // check every 5 minutes
}
scheduleWeeklyBilling();

startServer();
module.exports = app;
