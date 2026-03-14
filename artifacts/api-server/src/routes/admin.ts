import { Router } from 'express';
import { User } from '../models/User.js';
import { Vehicle } from '../models/Vehicle.js';
import { Organization } from '../models/Organization.js';
import { Trip } from '../models/Trip.js';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authenticate as any);

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!address) return resolve(null);
    const https = require('https');
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    https.get(url, { headers: { 'User-Agent': 'Rydeworks/1.0' } }, (res: any) => {
      let data = '';
      res.on('data', (d: any) => data += d);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          resolve(j[0] ? { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon) } : null);
        } catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

// ── Users ──────────────────────────────────────────────────────────
router.get('/users', requireRole('admin', 'dispatcher') as any, async (req: AuthRequest, res) => {
  try {
    const query: any = { organization: req.organizationId };
    if (req.query.all !== 'true') query.isActive = true;
    const users = await User.find(query)
      .populate('driverInfo.vehicleAssigned', 'name licensePlate')
      .sort({ lastName: 1 });
    res.json({ success: true, users: users.map(u => (u as any).toSafeObject()) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/users', requireRole('admin') as any, async (req: AuthRequest, res) => {
  try {
    const { firstName, lastName, email, phone, password, roles, vehicleId } = req.body;
    if (!firstName || !lastName || !email || !password) {
      res.status(400).json({ success: false, error: 'First name, last name, email, and password are required.' });
      return;
    }
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) { res.status(400).json({ success: false, error: 'Email already in use.' }); return; }

    const user: any = new User({
      firstName, lastName, email, phone, password,
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
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/users/:id', requireRole('admin') as any, async (req: AuthRequest, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!user) { res.status(404).json({ success: false, error: 'User not found.' }); return; }
    const { firstName, lastName, email, phone, roles, isActive, vehicleId, password } = req.body;
    if (firstName) (user as any).firstName = firstName;
    if (lastName)  (user as any).lastName  = lastName;
    if (email)     (user as any).email     = email.toLowerCase();
    if (phone)     (user as any).phone     = phone;
    if (roles)     (user as any).roles     = roles;
    if (typeof isActive === 'boolean') (user as any).isActive = isActive;
    if (password)  (user as any).password  = password;
    if (vehicleId !== undefined) {
      if (!(user as any).driverInfo) (user as any).driverInfo = {};
      (user as any).driverInfo.vehicleAssigned = vehicleId || null;
    }
    await user.save();
    res.json({ success: true, user: (user as any).toSafeObject() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/users/:id', requireRole('admin') as any, async (req: AuthRequest, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!user) { res.status(404).json({ success: false, error: 'User not found.' }); return; }
    (user as any).isActive = false;
    await user.save();
    res.json({ success: true, message: 'User deactivated.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Vehicles ──────────────────────────────────────────────────────────
router.get('/vehicles', async (req: AuthRequest, res) => {
  try {
    const vehicles = await Vehicle.find({ organization: req.organizationId, isActive: true })
      .populate('currentDriver', 'firstName lastName');
    res.json({ success: true, vehicles });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/vehicles', requireRole('admin') as any, async (req: AuthRequest, res) => {
  try {
    const payload: any = { ...req.body, organization: req.organizationId };
    if (payload.baseLocation?.address && (!payload.baseLocation?.lat || !payload.baseLocation?.lng)) {
      const coords = await geocodeAddress(payload.baseLocation.address);
      if (coords) payload.baseLocation = { ...payload.baseLocation, ...coords };
    }
    const vehicle = new Vehicle(payload);
    await vehicle.save();
    res.status(201).json({ success: true, vehicle });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/vehicles/:id', requireRole('admin') as any, async (req: AuthRequest, res) => {
  try {
    const payload: any = { ...req.body, updatedAt: new Date() };
    if (payload.baseLocation?.address && (!payload.baseLocation?.lat || !payload.baseLocation?.lng)) {
      const coords = await geocodeAddress(payload.baseLocation.address);
      if (coords) payload.baseLocation = { ...payload.baseLocation, ...coords };
    }
    const vehicle = await Vehicle.findOneAndUpdate(
      { _id: req.params.id, organization: req.organizationId },
      payload,
      { new: true }
    );
    if (!vehicle) { res.status(404).json({ success: false, error: 'Vehicle not found.' }); return; }
    res.json({ success: true, vehicle });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Organization ──────────────────────────────────────────────────────────
router.get('/org', async (req: AuthRequest, res) => {
  try {
    const org = await Organization.findById(req.organizationId);
    if (!org) { res.status(404).json({ success: false, error: 'Organization not found.' }); return; }
    res.json({ success: true, org });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/org', requireRole('admin') as any, async (req: AuthRequest, res) => {
  try {
    const allowed = ['name', 'email', 'phone', 'address', 'logo', 'primaryColor', 'accentColor',
      'appName', 'homeBases', 'fareZones', 'partnerRates', 'selfPayConfig', 'settings', 'paymentProvider'];
    const updates: any = {};
    allowed.forEach(key => { if (req.body[key] !== undefined) updates[key] = req.body[key]; });
    updates.updatedAt = new Date();

    // Geocode new home bases without coords
    if (updates.homeBases) {
      for (const base of updates.homeBases) {
        if (base.address && (!base.lat || !base.lng)) {
          const coords = await geocodeAddress(base.address);
          if (coords) { base.lat = coords.lat; base.lng = coords.lng; }
        }
      }
    }

    const org = await Organization.findByIdAndUpdate(req.organizationId, updates, { new: true });
    if (!org) { res.status(404).json({ success: false, error: 'Organization not found.' }); return; }
    res.json({ success: true, org });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Reports ──────────────────────────────────────────────────────────
router.get('/reports/trips', requireRole('admin', 'dispatcher') as any, async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate, format } = req.query as any;
    const query: any = { organization: req.organizationId };
    if (startDate || endDate) {
      query.tripDate = {};
      if (startDate) query.tripDate.$gte = new Date(startDate + 'T00:00:00');
      if (endDate)   query.tripDate.$lte = new Date(endDate + 'T23:59:59');
    }
    const trips = await Trip.find(query)
      .populate('driver', 'firstName lastName')
      .populate('vehicle', 'name licensePlate')
      .sort({ tripDate: -1 })
      .limit(500);

    const summary = {
      total: trips.length,
      completed: trips.filter(t => (t as any).status === 'completed').length,
      canceled:  trips.filter(t => (t as any).status === 'canceled').length,
      scheduled: trips.filter(t => (t as any).status === 'scheduled').length,
      inProgress: trips.filter(t => (t as any).status === 'in_progress').length,
      totalFare: trips.reduce((sum, t) => sum + ((t as any).payment?.actualFare || 0), 0)
    };

    if (format === 'csv') {
      const header = 'Trip Number,Date,Driver,Vehicle,Passengers,Status,Payment Type,Fare\n';
      const rows = trips.map(t => {
        const d = t as any;
        const driver = d.driver ? `${d.driver.firstName} ${d.driver.lastName}` : 'Unassigned';
        const vehicle = d.vehicle?.name || '';
        const passengers = [...new Set(d.stops?.filter((s: any) => s.type === 'pickup').map((s: any) => s.riderName))].join('; ');
        return `${d.tripNumber},${d.tripDate?.toISOString().slice(0,10)},${driver},${vehicle},"${passengers}",${d.status},${d.payment?.type || ''},${d.payment?.actualFare || 0}`;
      }).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=trips-report-${new Date().toISOString().slice(0,10)}.csv`);
      res.send(header + rows);
      return;
    }

    res.json({ success: true, data: trips, summary });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/reports/drivers', requireRole('admin', 'dispatcher') as any, async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate } = req.query as any;
    const query: any = { organization: req.organizationId };
    if (startDate || endDate) {
      query.tripDate = {};
      if (startDate) query.tripDate.$gte = new Date(startDate + 'T00:00:00');
      if (endDate)   query.tripDate.$lte = new Date(endDate + 'T23:59:59');
    }

    const trips = await Trip.find(query)
      .populate('driver', 'firstName lastName email')
      .sort({ tripDate: -1 });

    // Aggregate by driver
    const driverMap: Record<string, any> = {};
    for (const trip of trips) {
      const t = trip as any;
      if (!t.driver) continue;
      const driverId = t.driver._id.toString();
      if (!driverMap[driverId]) {
        driverMap[driverId] = {
          driver: t.driver,
          totalTrips: 0,
          completedTrips: 0,
          canceledTrips: 0,
          totalPassengers: 0,
          startMileage: 0,
          endMileage: 0
        };
      }
      driverMap[driverId].totalTrips++;
      if (t.status === 'completed') driverMap[driverId].completedTrips++;
      if (t.status === 'canceled')  driverMap[driverId].canceledTrips++;
      driverMap[driverId].totalPassengers += t.stops?.filter((s: any) => s.type === 'pickup').length || 0;
    }

    res.json({ success: true, data: Object.values(driverMap), summary: { totalDrivers: Object.keys(driverMap).length } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
