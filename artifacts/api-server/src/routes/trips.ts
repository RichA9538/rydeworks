import { Router } from 'express';
import { Trip } from '../models/Trip.js';
import { Rider } from '../models/Rider.js';
import { Organization } from '../models/Organization.js';
import { AccessCode } from '../models/AccessCode.js';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';
import { geocodeStops } from '../lib/geocode.js';

const router = Router();
router.use(authenticate as any);

function getDateRange(dateStr: string) {
  const start = new Date(`${dateStr}T00:00:00-05:00`);
  const end   = new Date(`${dateStr}T23:59:59.999-05:00`);
  return { start, end };
}

// ── Riders ──────────────────────────────────────────────────────────
router.get('/riders', requireRole('admin', 'dispatcher') as any, async (req: AuthRequest, res) => {
  try {
    const q = req.query.q as string;
    const query: any = { organization: req.organizationId, isActive: true };
    if (q) {
      query.$or = [
        { firstName: new RegExp(q, 'i') },
        { lastName:  new RegExp(q, 'i') },
        { phone:     new RegExp(q, 'i') },
        { riderId:   new RegExp(q, 'i') }
      ];
    }
    const riders = await Rider.find(query).sort({ lastName: 1 }).limit(50);
    res.json({ success: true, riders });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/riders', requireRole('admin', 'dispatcher') as any, async (req: AuthRequest, res) => {
  try {
    const org = await Organization.findByIdAndUpdate(
      req.organizationId,
      { $inc: { riderSequence: 1 } },
      { new: true }
    );
    const prefix = ((org as any).reportingPrefix || 'RWK').substring(0, 3).toUpperCase();
    const seq = String((org as any).riderSequence).padStart(4, '0');
    const riderId = `${prefix}-${seq}`;
    const { firstName, lastName, phone, email, homeAddress, homeAddressLat, homeAddressLng, notes, commonDestinations } = req.body;
    const rider = new Rider({
      firstName, lastName, phone, email, homeAddress, homeAddressLat, homeAddressLng, notes, commonDestinations,
      organization: req.organizationId,
      riderId
    });
    await rider.save();
    res.status(201).json({ success: true, rider });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/riders/:id', requireRole('admin', 'dispatcher') as any, async (req: AuthRequest, res) => {
  try {
    const rider = await Rider.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!rider) { res.status(404).json({ success: false, error: 'Rider not found.' }); return; }
    res.json({ success: true, rider });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/riders/:id', requireRole('admin', 'dispatcher') as any, async (req: AuthRequest, res) => {
  try {
    const rider = await Rider.findOneAndUpdate(
      { _id: req.params.id, organization: req.organizationId },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!rider) { res.status(404).json({ success: false, error: 'Rider not found.' }); return; }
    res.json({ success: true, rider });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Free ride codes
router.get('/riders/:id/free-ride-code', requireRole('admin', 'dispatcher') as any, async (req: AuthRequest, res) => {
  try {
    const rider = await Rider.findOne({ _id: req.params.id, organization: req.organizationId })
      .populate('freeRideCode');
    if (!rider) { res.status(404).json({ success: false, error: 'Rider not found.' }); return; }

    let code = (rider as any).freeRideCode;
    if (!code || !(code as any).isValidFreeRide?.()) {
      const exp = new Date();
      exp.setDate(exp.getDate() + 30);
      const newCode: any = new AccessCode({
        organization: req.organizationId,
        type: 'free_ride',
        rider: rider._id,
        freeRide: { expiresAt: exp, ridesAllowed: 1, ridesUsed: 0 }
      });
      await newCode.save();
      (rider as any).freeRideCode = newCode._id;
      await rider.save();
      code = newCode;
    }

    res.json({
      success: true,
      code: (code as any).code,
      expiresAt: (code as any).freeRide?.expiresAt,
      isActive: (code as any).isValidFreeRide?.() ?? true
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Trips ──────────────────────────────────────────────────────────
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { date, status, driverId } = req.query as any;
    const query: any = { organization: req.organizationId };

    // Drivers only see their own trips
    if (req.user.roles.includes('driver') && !req.user.roles.includes('dispatcher') && !req.user.roles.includes('admin')) {
      query.driver = req.user._id;
    }
    if (driverId) query.driver = driverId;
    if (status) query.status = status;
    if (date) {
      const { start, end } = getDateRange(date);
      query.tripDate = { $gte: start, $lte: end };
    }

    const trips = await Trip.find(query)
      .populate('driver', 'firstName lastName phone')
      .populate('vehicle', 'name licensePlate color')
      .sort({ tripDate: 1 });

    res.json({ success: true, trips });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', requireRole('admin', 'dispatcher') as any, async (req: AuthRequest, res) => {
  try {
    const { tripDate, driverId, vehicleId, homeBaseId, stops, payment, notes } = req.body;
    if (!tripDate) { res.status(400).json({ success: false, error: 'Trip date is required.' }); return; }

    const org = await Organization.findById(req.organizationId);
    const homeBase = homeBaseId
      ? (org as any)?.homeBases?.id(homeBaseId)
      : (org as any)?.homeBases?.find((b: any) => b.isDefault) || (org as any)?.homeBases?.[0];

    const geocodedStops = await geocodeStops(
      (stops || []).map((s: any, i: number) => ({ ...s, stopOrder: i, status: 'pending' }))
    );

    const trip: any = new Trip({
      organization: req.organizationId,
      tripDate: new Date(tripDate),
      driver:   driverId  || undefined,
      vehicle:  vehicleId || undefined,
      homeBase: homeBase ? { name: homeBase.name, address: homeBase.address, lat: homeBase.lat, lng: homeBase.lng } : undefined,
      stops:    geocodedStops,
      payment:  payment || { type: 'none' },
      notes,
      createdBy: req.user._id
    });

    await trip.save();
    await trip.populate('driver', 'firstName lastName phone');
    await trip.populate('vehicle', 'name licensePlate');
    res.status(201).json({ success: true, trip });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const query: any = { _id: req.params.id, organization: req.organizationId };
    if (req.user.roles.includes('driver') && !req.user.roles.includes('dispatcher') && !req.user.roles.includes('admin')) {
      query.driver = req.user._id;
    }
    const trip = await Trip.findOne(query)
      .populate('driver', 'firstName lastName phone')
      .populate('vehicle', 'name licensePlate color capacity');
    if (!trip) { res.status(404).json({ success: false, error: 'Trip not found.' }); return; }
    res.json({ success: true, trip });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/:id', requireRole('admin', 'dispatcher') as any, async (req: AuthRequest, res) => {
  try {
    const trip = await Trip.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!trip) { res.status(404).json({ success: false, error: 'Trip not found.' }); return; }

    const { tripDate, driverId, vehicleId, stops, payment, notes, status } = req.body;
    if (tripDate)  (trip as any).tripDate  = new Date(tripDate);
    if (driverId !== undefined)  (trip as any).driver  = driverId || null;
    if (vehicleId !== undefined) (trip as any).vehicle = vehicleId || null;
    if (stops)     (trip as any).stops     = stops;
    if (payment)   (trip as any).payment   = { ...(trip as any).payment, ...payment };
    if (notes !== undefined) (trip as any).notes = notes;
    if (status)    (trip as any).status    = status;

    await trip.save();
    await trip.populate('driver', 'firstName lastName phone');
    await trip.populate('vehicle', 'name licensePlate color');
    res.json({ success: true, trip });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', requireRole('admin', 'dispatcher') as any, async (req: AuthRequest, res) => {
  try {
    const trip = await Trip.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!trip) { res.status(404).json({ success: false, error: 'Trip not found.' }); return; }
    (trip as any).status = 'canceled';
    await trip.save();
    res.json({ success: true, message: 'Trip canceled.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update trip status
router.patch('/:id/status', async (req: AuthRequest, res) => {
  try {
    const { status, notes } = req.body;
    const trip = await Trip.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!trip) { res.status(404).json({ success: false, error: 'Trip not found.' }); return; }
    (trip as any).status = status;
    if (notes) (trip as any).notes = notes;
    await trip.save();
    res.json({ success: true, trip });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update individual stop status (driver actions)
router.patch('/:id/stops/:stopId/status', async (req: AuthRequest, res) => {
  try {
    const { status, notes } = req.body;
    const trip = await Trip.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!trip) { res.status(404).json({ success: false, error: 'Trip not found.' }); return; }

    const stop = (trip as any).stops.id(req.params.stopId);
    if (!stop) { res.status(404).json({ success: false, error: 'Stop not found.' }); return; }

    stop.status = status;
    if (notes) stop.notes = notes;
    if (status === 'arrived')   stop.actualArrival   = new Date();
    if (status === 'completed') stop.actualDeparture = new Date();

    // Auto-update trip status
    const allStops = (trip as any).stops;
    const allCompleted = allStops.every((s: any) => ['completed', 'no_show', 'canceled'].includes(s.status));
    const anyInProgress = allStops.some((s: any) => ['en_route', 'arrived', 'aboard'].includes(s.status));
    if (allCompleted) (trip as any).status = 'completed';
    else if (anyInProgress) (trip as any).status = 'in_progress';

    await trip.save();
    res.json({ success: true, trip });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Optimize trip route
router.post('/:id/optimize', requireRole('admin', 'dispatcher') as any, async (req: AuthRequest, res) => {
  try {
    const trip = await Trip.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!trip) { res.status(404).json({ success: false, error: 'Trip not found.' }); return; }

    const { optimizeRoute } = await import('../services/routeOptimizer.js');
    const result = await optimizeRoute({
      homeBase: (trip as any).homeBase || { address: '', lat: null, lng: null },
      stops: (trip as any).stops,
      tripDate: (trip as any).tripDate
    });

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    if (result.optimizedStops && result.optimizedStops.length > 0) {
      result.optimizedStops.forEach((optStop: any, newOrder: number) => {
        const dbStop = (trip as any).stops.id(optStop._id);
        if (dbStop) {
          dbStop.stopOrder = newOrder;
          if (optStop.estimatedArrival) dbStop.scheduledTime = new Date(optStop.estimatedArrival);
        }
      });
      (trip as any).stops.sort((a: any, b: any) => a.stopOrder - b.stopOrder);
      if (result.totalDistanceMiles || result.totalDurationMins) {
        (trip as any).optimizedRoute = {
          totalDistanceMiles: result.totalDistanceMiles,
          totalDurationMins:  result.totalDurationMins
        };
      }
      await trip.save();
    }

    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update driver log
router.patch('/:id/driver-log', async (req: AuthRequest, res) => {
  try {
    const trip = await Trip.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!trip) { res.status(404).json({ success: false, error: 'Trip not found.' }); return; }

    const { startMileage, endMileage, inspectionDone, inspectionNotes, startTime, endTime } = req.body;
    const log = (trip as any).driverLog || {};
    if (startMileage !== undefined) log.startMileage = startMileage;
    if (endMileage !== undefined)   log.endMileage   = endMileage;
    if (inspectionDone !== undefined) log.inspectionDone = inspectionDone;
    if (inspectionNotes !== undefined) log.inspectionNotes = inspectionNotes;
    if (startTime) log.startTime = new Date(startTime);
    if (endTime)   log.endTime   = new Date(endTime);
    (trip as any).driverLog = log;

    await trip.save();
    res.json({ success: true, trip });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
