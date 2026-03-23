const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const Organization = require('../models/Organization');
const Grant = require('../models/Grant');
const Partner = require('../models/Partner');
const AccessCode = require('../models/AccessCode');
const { authenticate, requireRole } = require('../middleware/auth');
const RiderSubscription = require('../models/RiderSubscription');
const Rider = require('../models/Rider');


function geocodeAddress(address) {
  return new Promise((resolve) => {
    if (!address) return resolve(null);
    const https = require('https');
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    https.get(url, { headers: { 'User-Agent': 'Rydeworks/1.0' } }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          resolve(j[0] ? { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon) } : null);
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}


// All admin routes require authentication + admin or dispatcher role
router.use(authenticate);

// ============================================================
// USERS
// ============================================================

// GET /api/admin/users — list all users in org
router.get('/users', requireRole('admin', 'dispatcher'), async (req, res) => {
  try {
    // ?all=true returns inactive users too (for team management view)
    // Default: only return active users (for driver dropdowns etc.)
    const query = { organization: req.organizationId };
    if (req.query.all !== 'true') query.isActive = true;
    const users = await User.find(query)
      .populate('driverInfo.vehicleAssigned', 'name licensePlate')
      .sort({ lastName: 1 });
    res.json({ success: true, users: users.map(u => u.toSafeObject()) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/users — create a new user
router.post('/users', requireRole('admin'), async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, roles, vehicleId } = req.body;
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ success: false, error: 'First name, last name, email, and password are required.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ success: false, error: 'Email already in use.' });

    const user = new User({
      firstName, lastName, email, phone,
      password,
      roles: roles || ['driver'],
      organization: req.organizationId,
      emailVerified: true,
      isActive: true
    });

    if (vehicleId && (roles || []).includes('driver')) {
      user.driverInfo = { vehicleAssigned: vehicleId, isAvailable: true };
    }

    await user.save();
    res.status(201).json({ success: true, user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/admin/users/:id — update user
router.put('/users/:id', requireRole('admin'), async (req, res) => {
  try {
    const { firstName, lastName, email, phone, roles, isActive, vehicleId, password } = req.body;
    const user = await User.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    if (firstName) user.firstName = firstName;
    if (lastName)  user.lastName  = lastName;
    if (email)     user.email     = email.toLowerCase();
    if (phone)     user.phone     = phone;
    if (roles)     user.roles     = roles;
    if (typeof isActive === 'boolean') user.isActive = isActive;
    if (password)  user.password  = password;

    if (vehicleId !== undefined) {
      if (!user.driverInfo) user.driverInfo = {};
      user.driverInfo.vehicleAssigned = vehicleId || null;
    }

    await user.save();
    res.json({ success: true, user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/admin/users/:id — deactivate user
router.delete('/users/:id', requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });
    user.isActive = false;
    await user.save();
    res.json({ success: true, message: 'User deactivated.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// VEHICLES
// ============================================================

// GET /api/admin/vehicles
router.get('/vehicles', async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ organization: req.organizationId, isActive: true })
      .populate('currentDriver', 'firstName lastName');
    res.json({ success: true, vehicles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/vehicles
router.post('/vehicles', requireRole('admin'), async (req, res) => {
  try {
    const payload = { ...req.body, organization: req.organizationId };
    if (payload.baseLocation?.address && (!payload.baseLocation?.lat || !payload.baseLocation?.lng)) {
      const coords = await geocodeAddress(payload.baseLocation.address);
      if (coords) payload.baseLocation = { ...payload.baseLocation, ...coords };
    }
    const vehicle = new Vehicle(payload);
    await vehicle.save();
    res.status(201).json({ success: true, vehicle });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/admin/vehicles/:id
router.put('/vehicles/:id', requireRole('admin'), async (req, res) => {
  try {
    const payload = { ...req.body, updatedAt: Date.now() };
    if (payload.baseLocation?.address && (!payload.baseLocation?.lat || !payload.baseLocation?.lng)) {
      const coords = await geocodeAddress(payload.baseLocation.address);
      if (coords) payload.baseLocation = { ...payload.baseLocation, ...coords };
    }
    const vehicle = await Vehicle.findOneAndUpdate(
      { _id: req.params.id, organization: req.organizationId },
      payload,
      { new: true }
    );
    if (!vehicle) return res.status(404).json({ success: false, error: 'Vehicle not found.' });
    res.json({ success: true, vehicle });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ORGANIZATION SETTINGS (fare zones, home bases, payment config)
// ============================================================

// GET /api/admin/org
router.get('/org', async (req, res) => {
  try {
    const org = await Organization.findById(req.organizationId);
    if (!org) return res.status(404).json({ success: false, error: 'Organization not found.' });
    res.json({ success: true, org });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/admin/org — update org settings (fare zones, home bases, branding, payment)
router.put('/org', requireRole('admin'), async (req, res) => {
  try {
    const allowed = ['name', 'email', 'phone', 'address', 'logo', 'primaryColor', 'accentColor',
                     'appName', 'homeBases', 'fareZones', 'partnerRates', 'selfPayConfig', 'settings',
                     'paymentProvider', 'weeklyBillingDay'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    updates.updatedAt = Date.now();

    // Geocode any home bases that have an address but no coordinates
    if (updates.homeBases && Array.isArray(updates.homeBases)) {
      for (const base of updates.homeBases) {
        if (base.address && (!base.lat || !base.lng)) {
          const coords = await geocodeAddress(base.address);
          if (coords) { base.lat = coords.lat; base.lng = coords.lng; }
        }
      }
    }

    const org = await Organization.findByIdAndUpdate(req.organizationId, updates, { new: true });
    res.json({ success: true, org });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// GRANTS
// ============================================================

router.get('/grants', async (req, res) => {
  try {
    const grants = await Grant.find({ organization: req.organizationId, isActive: true }).sort({ name: 1 });
    res.json({ success: true, grants });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/grants', requireRole('admin'), async (req, res) => {
  try {
    const grant = new Grant({ ...req.body, organization: req.organizationId });
    await grant.save();
    res.status(201).json({ success: true, grant });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/grants/:id', requireRole('admin'), async (req, res) => {
  try {
    const grant = await Grant.findOneAndUpdate(
      { _id: req.params.id, organization: req.organizationId },
      { ...req.body, updatedAt: Date.now() },
      { new: true }
    );
    if (!grant) return res.status(404).json({ success: false, error: 'Grant not found.' });
    res.json({ success: true, grant });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// PARTNERS
// ============================================================

router.get('/partners', async (req, res) => {
  try {
    const partners = await Partner.find({ organization: req.organizationId, isActive: true }).sort({ name: 1 });
    res.json({ success: true, partners });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/partners', requireRole('admin'), async (req, res) => {
  try {
    const partner = new Partner({ ...req.body, organization: req.organizationId });
    await partner.save();
    res.status(201).json({ success: true, partner });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/partners/:id', requireRole('admin'), async (req, res) => {
  try {
    const partner = await Partner.findOneAndUpdate(
      { _id: req.params.id, organization: req.organizationId },
      { ...req.body, updatedAt: Date.now() },
      { new: true }
    );
    if (!partner) return res.status(404).json({ success: false, error: 'Partner not found.' });
    res.json({ success: true, partner });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// FREE RIDE CODES
// ============================================================

router.get('/access-codes', requireRole('admin', 'dispatcher'), async (req, res) => {
  try {
    const codes = await AccessCode.find({ organization: req.organizationId })
      .populate('freeRide.assignedTo', 'firstName lastName anonymousId')
      .sort({ createdAt: -1 });
    res.json({ success: true, codes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/access-codes/generate', requireRole('admin', 'dispatcher'), async (req, res) => {
  try {
    const { type, quantity = 1, expiresInDays = 30, tripsAllowed, assignedTo, notes } = req.body;
    const codes = [];
    for (let i = 0; i < quantity; i++) {
      const data = { organization: req.organizationId, type, createdBy: req.user._id };
      if (notes) data.notes = notes;
      if (type === 'free_ride') {
        const exp = new Date();
        exp.setDate(exp.getDate() + expiresInDays);
        data.freeRide = { expiresAt: exp, tripsUsed: 0 };
        if (assignedTo) data.freeRide.assignedTo = assignedTo;
        if (tripsAllowed) data.freeRide.tripsAllowed = tripsAllowed;
      }
      const c = new AccessCode(data);
      await c.save();
      codes.push(c);
    }
    res.status(201).json({ success: true, codes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// RIDER SUBSCRIPTIONS
// ============================================================

// POST /api/admin/riders/:id/cancel-subscription — dispatcher cancels rider subscription
router.post('/riders/:id/cancel-subscription', requireRole('admin', 'dispatcher'), async (req, res) => {
  try {
    const { reason, chargeMinimum = false } = req.body;
    const rider = await Rider.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!rider) return res.status(404).json({ success: false, error: 'Rider not found.' });

    const sub = await RiderSubscription.findOne({ rider: rider._id, status: 'active' });
    if (!sub) return res.status(404).json({ success: false, error: 'No active subscription found.' });

    const now = new Date();
    const enrolledAt = sub.createdAt;
    const daysSinceEnrollment = (now - enrolledAt) / (1000 * 60 * 60 * 24);
    const withinFreeRidePeriod = daysSinceEnrollment <= 30;

    sub.status = 'cancelled';
    sub.canceledAt = now;
    sub.canceledBy = req.user._id;
    sub.cancellationNote = reason || 'Canceled by dispatcher';

    let chargeAmount = 0;
    let chargeNote = '';

    // Charge minimum commitment if within 30 days and they haven't met it
    if (withinFreeRidePeriod && chargeMinimum && sub.minimumCommitmentAmount > 0 && !sub.minimumCommitmentPaid) {
      chargeAmount = sub.minimumCommitmentAmount;
      chargeNote = `1-week minimum commitment charge: $${chargeAmount.toFixed(2)}`;

      if (sub.stripeCustomerId && sub.stripePaymentMethodId && process.env.STRIPE_SECRET_KEY) {
        try {
          const Stripe = require('stripe');
          const stripe = Stripe(process.env.STRIPE_SECRET_KEY.trim());
          const pi = await stripe.paymentIntents.create({
            amount: Math.round(chargeAmount * 100),
            currency: 'usd',
            customer: sub.stripeCustomerId,
            payment_method: sub.stripePaymentMethodId,
            confirm: true,
            automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
            description: `Rydeworks cancellation fee — 1-week minimum commitment`,
            metadata: { riderId: rider._id.toString(), subscriptionId: sub._id.toString() }
          });
          sub.minimumCommitmentPaid = true;
          sub.cancelChargeApplied = true;
          sub.payments.push({
            amount: chargeAmount,
            method: 'card',
            stripePaymentIntentId: pi.id,
            type: 'cancellation_fee',
            note: chargeNote,
            recordedBy: req.user._id
          });
        } catch (stripeErr) {
          console.error('Cancellation charge failed:', stripeErr.message);
          chargeNote += ' (charge failed — collect manually)';
        }
      } else if (['venmo', 'cashapp'].includes(sub.paymentMethodType)) {
        chargeNote += ` — collect via ${sub.paymentMethodType}`;
        sub.cancelChargeApplied = false;
      }
    }

    await sub.save();

    // Deactivate rider
    rider.isActive = false;
    await rider.save();

    res.json({
      success: true,
      message: `Subscription canceled.${chargeAmount > 0 ? ` ${chargeNote}` : ''}`,
      chargeAmount,
      chargeNote,
      withinFreeRidePeriod
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/riders/:id/log-payment — dispatcher logs manual Venmo/Cash App payment
router.post('/riders/:id/log-payment', requireRole('admin', 'dispatcher'), async (req, res) => {
  try {
    const { amount, method, note } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ success: false, error: 'Valid amount required.' });

    const rider = await Rider.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!rider) return res.status(404).json({ success: false, error: 'Rider not found.' });

    const sub = await RiderSubscription.findOne({ rider: rider._id });
    if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found.' });

    sub.creditBalance += parseFloat(amount);
    sub.payments.push({
      amount: parseFloat(amount),
      method: method || sub.paymentMethodType,
      type: 'manual',
      note: note || `Manual payment recorded by dispatcher`,
      recordedBy: req.user._id
    });
    await sub.save();

    res.json({ success: true, newBalance: sub.creditBalance, message: `$${parseFloat(amount).toFixed(2)} credited to rider account.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/riders/:id/issue-free-ride — admin issues additional free ride code
router.post('/riders/:id/issue-free-ride', requireRole('admin'), async (req, res) => {
  try {
    const { days = 30, reason } = req.body;
    const rider = await Rider.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!rider) return res.status(404).json({ success: false, error: 'Rider not found.' });

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'FREE-';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await AccessCode.create({
      organization: req.organizationId,
      rider: rider._id,
      code, type: 'free_ride', expiresAt, isActive: true,
      notes: `Manually issued by admin — ${reason || 'admin discretion'}`
    });

    const sub = await RiderSubscription.findOne({ rider: rider._id });
    if (sub) {
      sub.freeRideCode = code;
      sub.codeExpiresAt = expiresAt;
      await sub.save();
    }

    res.json({ success: true, code, expiresAt });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// INTEGRATION STATUS
// ============================================================

// GET /api/admin/integration-status — check which third-party services are configured
router.get('/integration-status', requireRole('admin', 'dispatcher'), async (req, res) => {
  const stripe = !!(process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_PUBLISHABLE_KEY?.trim());
  const twilio = !!(process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim() && process.env.TWILIO_PHONE_NUMBER?.trim());
  const mapbox = !!process.env.MAPBOX_TOKEN?.trim();

  // Attempt a lightweight Stripe connectivity check
  let stripeConnected = false;
  if (stripe) {
    try {
      const Stripe = require('stripe');
      const s = Stripe(process.env.STRIPE_SECRET_KEY.trim());
      await s.balance.retrieve();
      stripeConnected = true;
    } catch (e) {
      stripeConnected = false;
    }
  }

  res.json({
    success: true,
    stripe: { configured: stripe, connected: stripeConnected },
    twilio: { configured: twilio },
    mapbox: { configured: mapbox }
  });
});

module.exports = router;
