const express = require('express');
const router = express.Router();
const Trip = require('../models/Trip');
const Rider = require('../models/Rider');
const Organization = require('../models/Organization');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const { authenticate, requireRole } = require('../middleware/auth');
const { sendSms } = require('../sms');
const RiderSubscription = require('../models/RiderSubscription');
const Stripe = require('stripe');

router.use(authenticate);

// ============================================================
// HELPERS
// ============================================================

// Calculate zone based on straight-line distance (miles) from home base
// Returns the matching fare zone from org settings
async function calculateFareZone(orgId, destLat, destLng, homeLat, homeLng) {
  const org = await Organization.findById(orgId);
  if (!org || !org.fareZones || org.fareZones.length === 0) return null;

  // Haversine distance in miles
  const R = 3958.8;
  const dLat = (destLat - homeLat) * Math.PI / 180;
  const dLng = (destLng - homeLng) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(homeLat*Math.PI/180) * Math.cos(destLat*Math.PI/180) * Math.sin(dLng/2)**2;
  const distMiles = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  // Find matching zone
  const zone = org.fareZones.find(z => {
    const min = z.minMiles || 0;
    const max = z.maxMiles;
    if (max === null || max === undefined) return distMiles >= min;
    return distMiles >= min && distMiles < max;
  });

  return zone ? { zone, distMiles } : null;
}



function getEasternRange(dateStr) {
  const noon = new Date(`${dateStr}T12:00:00`);
  const isDST = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).format(noon).includes('EDT');
  const offset = isDST ? '-04:00' : '-05:00';
  const start = new Date(`${dateStr}T00:00:00${offset}`);
  const end = new Date(`${dateStr}T23:59:59.999${offset}`);
  return { start, end };
}

// ============================================================
// RIDERS
// ============================================================

// GET /api/trips/riders — search riders
router.get('/riders', requireRole('admin', 'dispatcher'), async (req, res) => {
  try {
    const q = req.query.q;
    const query = { organization: req.organizationId, isActive: true };
    if (q) {
      query.$or = [
        { firstName: new RegExp(q, 'i') },
        { lastName:  new RegExp(q, 'i') },
        { phone:     new RegExp(q, 'i') },
        { riderId:    new RegExp(q, 'i') },
        { anonymousId: new RegExp(q, 'i') }
      ];
    }
    const riders = await Rider.find(query).sort({ lastName: 1 }).limit(50);
    res.json({ success: true, riders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/trips/riders — create rider with sequential riderId
router.post('/riders', requireRole('admin', 'dispatcher'), async (req, res) => {
  try {
    // Atomically increment riderSequence and get the new value
    const org = await Organization.findByIdAndUpdate(
      req.organizationId,
      { $inc: { riderSequence: 1 } },
      { new: true }
    );
    const prefix = ((org.reportingPrefix || 'RWK')).substring(0, 3).toUpperCase();
    const seq = String(org.riderSequence).padStart(4, '0');
    const riderId = `${prefix}-${seq}`;
    // Whitelist only safe fields — never pass anonymousId or other legacy fields
    // that have unique indexes, to avoid E11000 duplicate key errors.
    const { firstName, lastName, phone, email, homeAddress, homeAddressLat, homeAddressLng, notes, commonDestinations } = req.body;
    const rider = new Rider({
      firstName, lastName, phone, email, homeAddress, homeAddressLat, homeAddressLng, notes, commonDestinations,
      organization: req.organizationId,
      riderId
    });
    await rider.save();
    res.status(201).json({ success: true, rider });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/trips/riders/:id/free-ride-code — get or create active free ride code for rider
const AccessCode = require('../models/AccessCode');
router.get('/riders/:id/free-ride-code', requireRole('admin', 'dispatcher'), async (req, res) => {
  try {
    const rider = await Rider.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!rider) return res.status(404).json({ success: false, error: 'Rider not found.' });

    // Check if rider already has an active non-expired free ride code
    if (rider.freeRideCode) {
      const existing = await AccessCode.findById(rider.freeRideCode);
      if (existing && existing.status === 'available' && existing.freeRide?.expiresAt > new Date()) {
        return res.json({ success: true, code: existing.code, expiresAt: existing.freeRide.expiresAt, isNew: false });
      }
    }

    // Generate a new free ride code for this rider
    const exp = new Date();
    exp.setDate(exp.getDate() + 30);
    const newCode = new AccessCode({
      organization: req.organizationId,
      type: 'free_ride',
      status: 'available',
      createdBy: req.user._id,
      freeRide: { assignedTo: rider._id, expiresAt: exp, tripsUsed: 0 }
    });
    await newCode.save();

    // Link code to rider
    rider.freeRideCode = newCode._id;
    await rider.save();

    res.json({ success: true, code: newCode.code, expiresAt: newCode.freeRide.expiresAt, isNew: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/trips/riders/:id — fetch single rider
router.get('/riders/:id', requireRole('admin', 'dispatcher'), async (req, res) => {
  try {
    const rider = await Rider.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!rider) return res.status(404).json({ success: false, error: 'Rider not found.' });
    let freeRideActive = false;
    let freeRideCode = null;
    let freeRideExpiresAt = null;
    if (rider.freeRideCode) {
      const code = await AccessCode.findById(rider.freeRideCode);
      if (code?.freeRide?.expiresAt && code.freeRide.expiresAt > new Date() && code.status === 'available') {
        freeRideActive = true;
        freeRideCode = code.code;
        freeRideExpiresAt = code.freeRide.expiresAt;
      }
    }
    const sub = await RiderSubscription.findOne({ $or: [{ rider: rider._id }, { phone: rider.phone }], status: 'active' }).sort({ updatedAt: -1 });
    const paymentState = {
      riderId: rider.riderId || rider.anonymousId || null,
      freeRideActive,
      freeRideCode,
      freeRideExpiresAt,
      freeRideExpiresAtLabel: freeRideExpiresAt ? new Date(freeRideExpiresAt).toLocaleDateString('en-US') : null,
      paymentMode: freeRideActive ? 'free_ride' : (sub ? 'self_pay' : 'none'),
      paymentModeLabel: freeRideActive ? 'Free Ride Code' : (sub ? 'Self Pay / Wallet' : 'Not configured'),
      subscriptionStatusLabel: sub ? `$${Number(sub.creditBalance || 0).toFixed(2)} balance` : null,
      paymentFailed: rider.paymentFailed || false,
      paymentFailedAt: rider.paymentFailedAt || null
    };
    res.json({ success: true, rider, paymentState });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/trips/riders/:id
router.put('/riders/:id', requireRole('admin', 'dispatcher'), async (req, res) => {
  try {
    // Whitelist allowed fields — never let a client overwrite organization, riderId, or _id
    const { firstName, lastName, phone, email, homeAddress, homeAddressLat, homeAddressLng, notes, commonDestinations } = req.body;
    const rider = await Rider.findOneAndUpdate(
      { _id: req.params.id, organization: req.organizationId },
      { firstName, lastName, phone, email, homeAddress, homeAddressLat, homeAddressLng, notes, commonDestinations, updatedAt: Date.now() },
      { new: true }
    );
    if (!rider) return res.status(404).json({ success: false, error: 'Rider not found.' });
    res.json({ success: true, rider });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/trips/riders/:id/clear-payment-failure — dispatcher clears the paymentFailed flag after rider updates card
router.post('/riders/:id/clear-payment-failure', requireRole('admin', 'dispatcher'), async (req, res) => {
  try {
    const rider = await Rider.findOneAndUpdate(
      { _id: req.params.id, organization: req.organizationId },
      { paymentFailed: false, paymentFailedAt: null, updatedAt: Date.now() },
      { new: true }
    );
    if (!rider) return res.status(404).json({ success: false, error: 'Rider not found.' });
    res.json({ success: true, rider });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/trips/riders/:id/common-destinations — quick-add a single common destination
router.post('/riders/:id/common-destinations', requireRole('admin', 'dispatcher'), async (req, res) => {
  try {
    const { label, address } = req.body;
    if (!address) return res.status(400).json({ success: false, error: 'Address is required.' });
    const rider = await Rider.findOneAndUpdate(
      { _id: req.params.id, organization: req.organizationId },
      { $push: { commonDestinations: { label: label || address, address } } },
      { new: true }
    );
    if (!rider) return res.status(404).json({ success: false, error: 'Rider not found.' });
    res.json({ success: true, rider });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/trips/riders/:id — soft-delete (set isActive: false)
router.delete('/riders/:id', requireRole('admin', 'dispatcher'), async (req, res) => {
  try {
    const rider = await Rider.findOneAndUpdate(
      { _id: req.params.id, organization: req.organizationId },
      { isActive: false, updatedAt: Date.now() },
      { new: true }
    );
    if (!rider) return res.status(404).json({ success: false, error: 'Rider not found.' });
    res.json({ success: true, message: 'Rider removed.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// FARE CALCULATION
// ============================================================

// POST /api/trips/calculate-fare
router.post('/calculate-fare', requireRole('admin', 'dispatcher'), async (req, res) => {
  try {
    const { destLat, destLng, homeBaseName, pickupLat, pickupLng } = req.body;
    const org = await Organization.findById(req.organizationId);
    if (!org) return res.status(404).json({ success: false, error: 'Organization not found.' });

    // If pickup coords provided, calculate fare from pickup to destination
    // Otherwise fall back to home base distance (legacy behavior)
    let originLat, originLng;
    if (pickupLat && pickupLng) {
      originLat = parseFloat(pickupLat);
      originLng = parseFloat(pickupLng);
    } else {
      let homeBase = org.homeBases.find(b => b.name === homeBaseName) ||
                     org.homeBases.find(b => b.isDefault) ||
                     org.homeBases[0];
      if (!homeBase || homeBase.lat == null || homeBase.lng == null) {
        return res.status(400).json({ success: false, error: 'Home base location not configured.' });
      }
      originLat = homeBase.lat;
      originLng = homeBase.lng;
    }

    const result = await calculateFareZone(req.organizationId, destLat, destLng, originLat, originLng);
    if (!result) return res.json({ success: true, zone: null, fare: org.defaultRoundTrip || 20 });

    res.json({
      success: true,
      zone: result.zone,
      distanceMiles: Math.round(result.distMiles * 10) / 10,
      fare: result.zone.roundTripFare,
      oneWayFare: result.zone.oneWayFare
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// TRIPS — DISPATCHER
// ============================================================

// GET /api/trips — list trips (with filters)
router.get('/', requireRole('admin', 'dispatcher'), async (req, res) => {
  try {
    const { date, dateFrom, dateTo, driverId, status, excludeStatus } = req.query;
    const query = { organization: req.organizationId };

    if (date) {
      const { start, end } = getEasternRange(date);
      query.tripDate = { $gte: start, $lte: end };
    } else if (dateFrom || dateTo) {
      query.tripDate = {};
      if (dateFrom) { const { start } = getEasternRange(dateFrom); query.tripDate.$gte = start; }
      if (dateTo)   { const { end } = getEasternRange(dateTo); query.tripDate.$lte = end; }
    }
    if (driverId) query.driver = driverId;
    if (status)        query.status = status.includes(',') ? { $in: status.split(',') } : status;
    else if (excludeStatus) query.status = { $ne: excludeStatus };

    const trips = await Trip.find(query)
      .populate('driver', 'firstName lastName phone driverInfo')
      .populate('vehicle', 'name licensePlate')
      .populate('stops.riderId', 'firstName lastName phone anonymousId')
      .sort({ tripDate: 1, createdAt: 1 });

    // Secondary sort: chronological by first pickup scheduledTime.
    // Outbound trips often have no scheduledTime; return trips always do (returnTime).
    // Rule: when a trip has no scheduledTime, non-return trips sort before return trips;
    // when both have times, sort purely by time (earliest first).
    trips.sort((a, b) => {
      const aPickup = a.stops?.find(s => s.type === 'pickup')?.scheduledTime;
      const bPickup = b.stops?.find(s => s.type === 'pickup')?.scheduledTime;
      const aIsReturn = a.notes?.includes('[RETURN TRIP]') ? 1 : 0;
      const bIsReturn = b.notes?.includes('[RETURN TRIP]') ? 1 : 0;
      if (aPickup && bPickup) return new Date(aPickup) - new Date(bPickup);
      if (!aPickup && !bPickup) return aIsReturn - bIsReturn;
      if (!aPickup) return aIsReturn ? 1 : -1;
      return bIsReturn ? -1 : 1;
    });

    res.set('Cache-Control', 'no-cache');
    res.json({ success: true, trips });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/trips/booking-requests — unassigned self-booked trips needing a driver
router.get('/booking-requests', requireRole('admin', 'dispatcher'), async (req, res) => {
  try {
    const trips = await Trip.find({
      organization: req.organizationId,
      source: 'self_booked',
      $or: [{ driver: { $exists: false } }, { driver: null }]
    })
      .populate('stops.riderId', 'firstName lastName phone')
      .sort({ createdAt: -1 });
    res.json({ success: true, trips });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/trips/:id
router.get('/:id', async (req, res) => {
  try {
    const trip = await Trip.findOne({ _id: req.params.id, organization: req.organizationId })
      .populate('driver', 'firstName lastName phone driverInfo')
      .populate('vehicle', 'name licensePlate color')
      .populate('stops.riderId', 'firstName lastName phone anonymousId notes');

    if (!trip) return res.status(404).json({ success: false, error: 'Trip not found.' });

    // Drivers can only see their own trips
    if (!req.user.hasRole('dispatcher') && !req.user.hasRole('admin')) {
      if (trip.driver?._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, error: 'Access denied.' });
      }
    }
    res.json({ success: true, trip });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/trips — create trip
router.post('/', requireRole('admin', 'dispatcher'), async (req, res) => {
  try {
    // Block self_pay trips for riders with failed payment
    if (req.body.payment?.type === 'self_pay' && Array.isArray(req.body.stops)) {
      const riderIds = [...new Set(req.body.stops.map(s => s.riderId).filter(Boolean))];
      if (riderIds.length > 0) {
        const failedRiders = await Rider.find({
          _id: { $in: riderIds },
          organization: req.organizationId,
          paymentFailed: true,
          isActive: true
        }).select('firstName lastName');
        if (failedRiders.length > 0) {
          const names = failedRiders.map(r => `${r.firstName} ${r.lastName}`).join(', ');
          return res.status(402).json({
            success: false,
            error: `Booking blocked — payment on file has failed for: ${names}. Rider must update their payment method before new trips can be booked.`,
            paymentFailed: true,
            blockedRiders: failedRiders.map(r => ({ id: r._id, name: `${r.firstName} ${r.lastName}` }))
          });
        }
      }
    }

    const trip = new Trip({
      ...req.body,
      organization: req.organizationId,
      createdBy: req.user._id
    });
    await trip.save();

    // Mark vehicle as in_use if assigned
    if (trip.vehicle) {
      await Vehicle.findByIdAndUpdate(trip.vehicle, { status: 'in_use', currentDriver: trip.driver });
    }

    const populated = await Trip.findById(trip._id)
      .populate('driver', 'firstName lastName phone')
      .populate('vehicle', 'name licensePlate');

    // Send SMS to driver if they have a phone number
    try {
      const driverPhone = populated.driver?.phone;
      if (driverPhone) {
        const isReturn = (trip.notes || '').startsWith('[RETURN TRIP]');
        const firstPickup  = trip.stops?.find(s => s.type === 'pickup');
        const firstDropoff = trip.stops?.find(s => s.type === 'dropoff');
        const timeStr = firstPickup?.scheduledTime
          ? new Date(firstPickup.scheduledTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
          : 'TBD';
        const label = isReturn ? 'RETURN TRIP' : 'NEW TRIP';
        const msg =
          `Rydeworks ${label} #${trip.tripNumber}\n` +
          `Date: ${new Date(trip.tripDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}\n` +
          `Pickup: ${timeStr} @ ${firstPickup?.address || 'TBD'}\n` +
          `Drop-off: ${firstDropoff?.address || 'TBD'}\n` +
          `Vehicle: ${populated.vehicle?.name || 'TBD'}`;
        await sendSms(driverPhone, msg);
      }
    } catch (smsErr) {
      console.error('[SMS] Trip notification failed:', smsErr.message);
    }

    // Deduct from rider subscription credit balance if free_ride payment type
    try {
      const freeCode = trip.payment?.freeRideCode;
      if (trip.payment?.type === 'free_ride' && freeCode) {
        const sub = await RiderSubscription.findOne({ freeRideCode: freeCode, status: 'active' });
        if (sub) {
          const fare = trip.payment?.estimatedFare || 0;
          sub.creditBalance = Math.max(0, sub.creditBalance - fare);
          if (!sub.initialBalanceUsed && sub.creditBalance === 0) sub.initialBalanceUsed = true;
          // Auto-replenish if balance drops below $20
          if (sub.creditBalance < 20 && process.env.STRIPE_SECRET_KEY) {
            try {
              const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
              const pi = await stripe.paymentIntents.create({
                amount: 10000, currency: 'usd',
                customer: sub.stripeCustomerId,
                payment_method: sub.stripePaymentMethodId,
                confirm: true,
                automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
                description: 'Rydeworks auto-replenishment — $100'
              });
              if (pi.status === 'succeeded') {
                sub.creditBalance += 100;
                sub.payments.push({ amount: 100, stripePaymentIntentId: pi.id, type: 'replenishment' });
                await sendSms(sub.phone, `Rydeworks: Your ride credit balance was replenished with $100. New balance: $${sub.creditBalance.toFixed(2)}.`);
              } else {
                // Payment did not succeed — flag the rider and send reminder SMS
                try {
                  const riderToFlag = await Rider.findOne({ $or: [{ _id: sub.rider }, { phone: sub.phone }], organization: req.organizationId });
                  if (riderToFlag) {
                    riderToFlag.paymentFailed   = true;
                    riderToFlag.paymentFailedAt = new Date();
                    await riderToFlag.save();
                  }
                } catch (flagErr) { console.warn('[paymentFailed flag]', flagErr.message); }
                if (sub.phone) {
                  await sendSms(sub.phone, `Rydeworks: Your payment of $100 did not go through. Future ride bookings will be paused until you update your payment method at rydeworks.com/book or call dispatch.`).catch(() => {});
                }
              }
            } catch (replenishErr) {
              console.error('[Auto-replenish] Failed:', replenishErr.message);
              // Also flag on exception (card declined, invalid, etc.)
              try {
                const riderToFlag = await Rider.findOne({ $or: [{ _id: sub.rider }, { phone: sub.phone }], organization: req.organizationId });
                if (riderToFlag && !riderToFlag.paymentFailed) {
                  riderToFlag.paymentFailed   = true;
                  riderToFlag.paymentFailedAt = new Date();
                  await riderToFlag.save();
                }
              } catch (flagErr) { console.warn('[paymentFailed flag]', flagErr.message); }
              if (sub.phone) {
                await sendSms(sub.phone, `Rydeworks: We were unable to process your payment. Please update your payment method at rydeworks.com/book or call dispatch to avoid interruption to your service.`).catch(() => {});
              }
            }
          }
          await sub.save();
        }
      }
    } catch (balanceErr) {
      console.error('[Balance deduction] Non-fatal error:', balanceErr.message);
    }
    res.status(201).json({ success: true, trip: populated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/trips/:id — update trip (dispatcher)
router.put('/:id', requireRole('admin', 'dispatcher'), async (req, res) => {
  try {
    const trip = await Trip.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!trip) return res.status(404).json({ success: false, error: 'Trip not found.' });

    // Safe field updates — only update what was explicitly sent
    const { driver, vehicle, notes, status, stopUpdates } = req.body;
    const driverWasUnassigned = !trip.driver;
    if (driver  !== undefined) trip.driver  = driver;
    if (vehicle !== undefined) trip.vehicle = vehicle;
    if (notes   !== undefined) trip.notes   = notes;
    if (status  !== undefined) trip.status  = status;

    // stopUpdates: array of { stopId, scheduledTime?, appointmentTime?, notes?, address? }
    if (Array.isArray(stopUpdates)) {
      for (const upd of stopUpdates) {
        const stop = trip.stops.id(upd.stopId);
        if (!stop) continue;
        if (upd.scheduledTime   !== undefined) stop.scheduledTime   = upd.scheduledTime   ? new Date(upd.scheduledTime)   : null;
        if (upd.appointmentTime !== undefined) stop.appointmentTime = upd.appointmentTime ? new Date(upd.appointmentTime) : null;
        if (upd.notes           !== undefined) stop.notes           = upd.notes;
        if (upd.address         !== undefined) stop.address         = upd.address;
      }
    }

    trip.updatedAt = Date.now();
    await trip.save();

    const populated = await Trip.findById(trip._id)
      .populate('driver', 'firstName lastName phone')
      .populate('vehicle', 'name licensePlate')
      .populate('stops.riderId', 'firstName lastName phone');

    // SMS driver when they are newly assigned to a trip
    if (driver && driverWasUnassigned && populated.driver?.phone) {
      try {
        const firstPickup = populated.stops?.find(s => s.type === 'pickup');
        const pickupAddr = firstPickup?.address || 'See dispatch app';
        const pickupTime = firstPickup?.scheduledTime
          ? new Date(firstPickup.scheduledTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
          : 'TBD';
        await sendSms(populated.driver.phone, `RYDEWORKS: You have a new trip assigned. Pickup: ${pickupAddr} at ${pickupTime}. Open your driver app for details.`);
      } catch (smsErr) {
        console.error('[SMS] Driver assignment notification failed:', smsErr.message);
      }
    }

    res.json({ success: true, trip: populated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// TRIPS — DRIVER ACTIONS
// ============================================================

// GET /api/trips/driver/my-trips — driver sees their own trips
router.get('/driver/my-trips', async (req, res) => {
  try {
    const { date } = req.query;
    const query = { driver: req.user._id, organization: req.organizationId };

    let findQuery;
    if (date) {
      const { start, end } = getEasternRange(date);
      findQuery = { ...query, tripDate: { $gte: start, $lte: end }, status: { $nin: ['canceled','completed'] } };
    } else {
      // Default: today and future, but always include scheduled/in_progress trips regardless of date
      const todayEt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
      const { start } = getEasternRange(todayEt);
      findQuery = {
        $or: [
          { ...query, status: { $nin: ['canceled','completed'] }, tripDate: { $gte: start } },
          { ...query, status: { $in: ['in_progress', 'scheduled'] } }
        ]
      };
    }

    const rawTrips = await Trip.find(findQuery)
      .populate('vehicle', 'name licensePlate color')
      .populate('stops.riderId', 'firstName lastName phone notes')
      .sort({ tripDate: 1 });

    // Transform stops into the format the driver app expects:
    // Group consecutive pickup+dropoff pairs and add pickupAddress/dropoffAddress/scheduledPickupTime
    const trips = rawTrips.map(trip => {
      const t = trip.toObject();
      const orderedStops = [...(t.stops || [])].sort((a, b) => (a.stopOrder ?? 0) - (b.stopOrder ?? 0));
      const riderStops = {};

      orderedStops.forEach(stop => {
        const key = stop.riderId?._id?.toString() || stop.riderId?.toString?.() || stop._id.toString();
        if (!riderStops[key]) riderStops[key] = { pickup: null, dropoff: null };
        if (stop.type === 'pickup') riderStops[key].pickup = stop;
        if (stop.type === 'dropoff') riderStops[key].dropoff = stop;
      });

      t.stops = orderedStops.map(stop => {
        const key = stop.riderId?._id?.toString() || stop.riderId?.toString?.() || stop._id.toString();
        const pair = riderStops[key] || {};
        return {
          ...stop,
          pairedAddress: stop.type === 'pickup' ? (pair.dropoff?.address || '') : (pair.pickup?.address || ''),
          pickupAddress: pair.pickup?.address || (stop.type === 'pickup' ? stop.address : ''),
          dropoffAddress: pair.dropoff?.address || (stop.type === 'dropoff' ? stop.address : ''),
          scheduledPickupTime: pair.pickup?.scheduledTime || stop.scheduledTime || null,
        };
      });
      const remainingStops = orderedStops.filter(s => !['completed','no_show','canceled'].includes(s.status));
      const nextStop = remainingStops[0] || null;
      const nextStopTime = nextStop ? (nextStop.scheduledTime || nextStop.appointmentTime || null) : null;
      t.nextStopTime = nextStopTime;
      t.isReturnTrip = /\[RETURN TRIP\]/i.test(String(t.notes || ''));
      return t;
    }).sort((a, b) => {
      const aProg = a.status === 'in_progress' ? 0 : 1;
      const bProg = b.status === 'in_progress' ? 0 : 1;
      if (aProg !== bProg) return aProg - bProg;
      const at = a.nextStopTime ? new Date(a.nextStopTime).getTime() : Number.MAX_SAFE_INTEGER;
      const bt = b.nextStopTime ? new Date(b.nextStopTime).getTime() : Number.MAX_SAFE_INTEGER;
      if (at !== bt) return at - bt;
      const ar = a.isReturnTrip ? 1 : 0;
      const br = b.isReturnTrip ? 1 : 0;
      if (ar !== br) return ar - br;
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    });

    res.json({ success: true, trips });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/trips/driver/availability — driver toggles availability
router.post('/driver/availability', async (req, res) => {
  try {
    const { isAvailable } = req.body;
    if (typeof isAvailable !== 'boolean') {
      return res.status(400).json({ success: false, error: 'isAvailable boolean required.' });
    }
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { 'driverInfo.isAvailable': isAvailable, updatedAt: Date.now() },
      { new: true }
    ).populate('driverInfo.vehicleAssigned', 'name');

    // Notify dispatch via SMS when driver goes unavailable (taking a break)
    if (!isAvailable) {
      try {
        const org = await Organization.findById(req.organizationId);
        const dispatchPhone = process.env.DISPATCH_PHONE || org?.phone;
        if (dispatchPhone) {
          const driverName = `${user.firstName} ${user.lastName}`;
          const vehicleName = user.driverInfo?.vehicleAssigned?.name || 'their vehicle';
          await sendSms(dispatchPhone, `RYDEWORKS: ${driverName} (${vehicleName}) is now UNAVAILABLE / on break. Do not assign new trips until they mark available.`);
        }
      } catch (smsErr) {
        console.error('[SMS] Dispatch availability notification failed:', smsErr.message);
      }
    }

    res.json({ success: true, user: user?.toSafeObject ? user.toSafeObject() : user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/trips/driver/location — driver updates their GPS location
router.post('/driver/location', async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (!lat || !lng) return res.status(400).json({ success: false, error: 'lat and lng required.' });
    await require('../models/User').findByIdAndUpdate(req.user._id, {
      'driverInfo.currentLocation': { lat, lng }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/trips/:id/start — driver starts the trip (logs mileage + inspection)
router.post('/:id/start', async (req, res) => {
  try {
    const { startMileage, inspectionDone, inspectionNotes } = req.body;
    const trip = await Trip.findOne({ _id: req.params.id, driver: req.user._id });
    if (!trip) return res.status(404).json({ success: false, error: 'Trip not found.' });

    trip.status = 'in_progress';
    trip.driverLog.startMileage   = startMileage;
    trip.driverLog.inspectionDone = inspectionDone;
    trip.driverLog.inspectionNotes= inspectionNotes;
    trip.driverLog.startTime      = new Date();
    await trip.save();
    await User.findByIdAndUpdate(req.user._id, { 'driverInfo.isAvailable': false, updatedAt: Date.now() });

    res.json({ success: true, trip });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/trips/:id/stops/:stopId/status — driver updates a stop status
router.post('/:id/stops/:stopId/status', async (req, res) => {
  try {
    const { status, notes } = req.body;
    const validStatuses = ['en_route', 'arrived', 'aboard', 'completed', 'no_show', 'canceled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status.' });
    }

    const trip = await Trip.findOne({ _id: req.params.id, driver: req.user._id });
    if (!trip) return res.status(404).json({ success: false, error: 'Trip not found.' });

    const stop = trip.stops.id(req.params.stopId);
    if (!stop) return res.status(404).json({ success: false, error: 'Stop not found.' });

    stop.status = status;
    if (notes) stop.notes = notes;
    if (status === 'arrived')   stop.actualArrival   = new Date();
    if (status === 'completed') stop.actualDeparture = new Date();

    if (['en_route', 'arrived', 'aboard'].includes(status)) {
      trip.status = 'in_progress';
    }

    // When a stop is canceled, also cancel its paired stop (pickup↔dropoff for the same rider)
    // so the full leg is canceled and the trip status can resolve correctly.
    if (status === 'canceled' && stop.riderId) {
      const pairedType = stop.type === 'pickup' ? 'dropoff' : 'pickup';
      const paired = trip.stops.find(
        s => s.riderId?.toString() === stop.riderId.toString() &&
             s.type === pairedType &&
             !['completed', 'no_show', 'canceled'].includes(s.status)
      );
      if (paired) paired.status = 'canceled';
    }

    await trip.save();

    if (status === 'arrived') {
      try {
        let riderPhone = stop.riderPhone;
        let riderName = stop.riderName || 'your driver';
        if ((!riderPhone || !riderName) && stop.riderId) {
          const rider = await Rider.findById(stop.riderId).select('firstName phone');
          if (rider) {
            riderPhone = riderPhone || rider.phone;
            riderName = rider.firstName || riderName;
          }
        }
        if (riderPhone) {
          await sendSms(riderPhone, `Rydeworks: Your driver has arrived for pickup${riderName ? `, ${riderName}` : ''}. If you need help, call dispatch at 727-313-1241.`);
        }
      } catch (smsErr) {
        console.error('[SMS] Arrival notification failed:', smsErr.message);
      }
    }

    // Check if all stops are done → complete or cancel the trip
    // Pickup stops in 'aboard' state count as done (rider is on board, pickup complete)
    const allDone = trip.stops.every(s => {
      if (s.type === 'pickup' && s.status === 'aboard') return true;
      return ['completed', 'no_show', 'canceled'].includes(s.status);
    });
    if (allDone) {
      const allCanceled = trip.stops.every(s => s.status === 'canceled');
      trip.status = allCanceled ? 'canceled' : 'completed';
      trip.driverLog.endTime = new Date();
      await trip.save();
      // Free up vehicle and mark driver available
      if (trip.vehicle) {
        await Vehicle.findByIdAndUpdate(trip.vehicle, { status: 'available', currentDriver: null });
      }
      await User.findByIdAndUpdate(req.user._id, { 'driverInfo.isAvailable': true, updatedAt: Date.now() });
    }

    res.json({ success: true, trip });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/trips/:id/complete — driver ends the trip (logs end mileage)
router.post('/:id/complete', async (req, res) => {
  try {
    const { endMileage } = req.body;
    const trip = await Trip.findOne({ _id: req.params.id, driver: req.user._id });
    if (!trip) return res.status(404).json({ success: false, error: 'Trip not found.' });

    trip.status = 'completed';
    trip.driverLog.endMileage = endMileage;
    trip.driverLog.endTime    = new Date();
    await trip.save();

    if (trip.vehicle) {
      await Vehicle.findByIdAndUpdate(trip.vehicle, { status: 'available', currentDriver: null });
    }
    await User.findByIdAndUpdate(req.user._id, { 'driverInfo.isAvailable': true, updatedAt: Date.now() });

    res.json({ success: true, trip });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/trips/:id/cancel — driver, dispatcher, or admin cancels a trip
router.post('/:id/cancel', async (req, res) => {
  try {
    const { reason } = req.body;
    const query = { _id: req.params.id, organization: req.organizationId };
    // Drivers can only cancel their own trips
    const isPrivileged = req.user.hasRole('admin') || req.user.hasRole('dispatcher');
    if (!isPrivileged) query.driver = req.user._id;
    const trip = await Trip.findOne(query);
    if (!trip) return res.status(404).json({ success: false, error: 'Trip not found.' });
    if (['canceled','completed'].includes(trip.status)) {
      return res.status(400).json({ success: false, error: 'Trip cannot be canceled.' });
    }
    trip.status = 'canceled';
    if (reason) trip.notes = (trip.notes ? trip.notes + ' | ' : '') + `Canceled: ${reason}`;
    await trip.save();
    if (trip.vehicle) {
      await Vehicle.findByIdAndUpdate(trip.vehicle, { status: 'available', currentDriver: null });
    }
    res.json({ success: true, trip });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/trips/optimize-preview — validate route feasibility before saving (no trip ID needed)
router.post('/optimize-preview', requireRole('admin', 'dispatcher'), async (req, res) => {
  try {
    const { stops, homeBase, tripDate, vehicle } = req.body;
    if (!stops || stops.length === 0) {
      return res.status(400).json({ success: false, error: 'No stops provided.' });
    }
    const { optimizeRoute } = require('../services/routeOptimizer');
    const result = await optimizeRoute({
      homeBase: homeBase || (vehicle?.baseLocation ? vehicle.baseLocation : { address: '', lat: null, lng: null }),
      stops,
      tripDate: tripDate || new Date().toISOString()
    });
    res.json({ success: result.success, result, error: result.error });
  } catch (err) {
    console.error('Optimize preview error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/trips/:id/optimize — optimize route order and check feasibility
router.post('/:id/optimize', requireRole('admin', 'dispatcher'), async (req, res) => {
  try {
    const trip = await Trip.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!trip) return res.status(404).json({ success: false, error: 'Trip not found.' });

    const { optimizeRoute } = require('../services/routeOptimizer');
    const result = await optimizeRoute({
      homeBase: trip.homeBase || { address: '', lat: null, lng: null },
      stops: trip.stops,
      tripDate: trip.tripDate
    });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    // Apply optimized stop order to the trip
    if (result.optimizedStops && result.optimizedStops.length > 0) {
      result.optimizedStops.forEach((optStop, newOrder) => {
        const dbStop = trip.stops.id(optStop._id);
        if (dbStop) {
          dbStop.stopOrder = newOrder;
          if (optStop.estimatedArrival) dbStop.scheduledTime = new Date(optStop.estimatedArrival);
        }
      });
      trip.stops.sort((a, b) => a.stopOrder - b.stopOrder);
      trip.optimizedRoute = {
        totalDistanceMiles: result.totalDistanceMiles,
        totalDurationMins: result.totalDurationMins
      };
      await trip.save();
    }

    res.json({ success: true, result });
  } catch (err) {
    console.error('Optimize route error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
