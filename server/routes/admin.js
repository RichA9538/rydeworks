const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const Organization = require('../models/Organization');
const Grant = require('../models/Grant');
const Partner = require('../models/Partner');
const AccessCode = require('../models/AccessCode');
const { authenticate, requireRole } = require('../middleware/auth');


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

module.exports = router;
