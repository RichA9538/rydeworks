const express = require('express');
const router  = express.Router();
const Trip    = require('../models/Trip');
const Rider   = require('../models/Rider');
const RiderSubscription = require('../models/RiderSubscription');
const Grant   = require('../models/Grant');
const AccessCode = require('../models/AccessCode');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('admin', 'dispatcher'));

// Helper: parse date range from query, default to current month (Eastern time)
function parseDateRange(query) {
  const now = new Date();
  let fromStr = query.from;
  let toStr   = query.to;
  if (!fromStr) {
    // first day of current month in Eastern
    const y = now.toLocaleString('en-US', { timeZone: 'America/New_York', year: 'numeric' });
    const m = now.toLocaleString('en-US', { timeZone: 'America/New_York', month: '2-digit' });
    fromStr = `${y}-${m}-01`;
  }
  if (!toStr) {
    // last day of current month — go to first day of next month minus 1ms
    const y = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', year: 'numeric' }));
    const m = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'numeric' }));
    const lastDay = new Date(y, m, 0); // day 0 of next month = last day of this month
    toStr = `${y}-${String(m).padStart(2,'0')}-${String(lastDay.getDate()).padStart(2,'0')}`;
  }
  // Parse as Eastern midnight–end-of-day
  const isDST = (d) => {
    const jan = new Date(d.getFullYear(), 0, 1);
    const jul = new Date(d.getFullYear(), 6, 1);
    return d.getTimezoneOffset() < Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
  };
  // Use fixed offset: March-November = EDT (-04:00), else EST (-05:00)
  const fromDate = new Date(fromStr + 'T00:00:00');
  const toDate   = new Date(toStr   + 'T00:00:00');
  const fromOffset = isDST(fromDate) ? '-04:00' : '-05:00';
  const toOffset   = isDST(toDate)   ? '-04:00' : '-05:00';
  const from = new Date(`${fromStr}T00:00:00${fromOffset}`);
  const to   = new Date(`${toStr}T23:59:59.999${toOffset}`);
  return { from, to };
}

// Helper: extract zip from address string
function extractZip(address) {
  if (!address) return 'Unknown';
  const m = address.match(/\b(\d{5})(-\d{4})?\b/);
  return m ? m[1] : 'Unknown';
}

// GET /api/reports/summary?from=&to=
// Full operational summary for the period
router.get('/summary', async (req, res) => {
  try {
    const { from, to } = parseDateRange(req.query);
    const orgId = req.organizationId;

    const [trips, riders, subs, codes, grants] = await Promise.all([
      Trip.find({ organization: orgId, tripDate: { $gte: from, $lte: to } })
          .populate('stops.riderId', 'riderId homeAddress')
          .lean(),
      Rider.find({ organization: orgId }).lean(),
      RiderSubscription.find({ organization: orgId }).lean(),
      AccessCode.find({ organization: orgId, type: 'free_ride' }).lean(),
      Grant.find({ organization: orgId }).lean()
    ]);

    const completed = trips.filter(t => t.status === 'completed');
    const canceled  = trips.filter(t => t.status === 'canceled');

    // Revenue (self-pay + partner only — not grant or free_ride)
    const revenue = completed
      .filter(t => ['self_pay', 'partner'].includes(t.payment?.type))
      .reduce((s, t) => s + (t.payment?.actualFare || t.payment?.estimatedFare || 0), 0);

    // Total fare value (all trips including grant-funded and free_ride estimated)
    const totalFareValue = completed
      .reduce((s, t) => s + (t.payment?.actualFare || t.payment?.estimatedFare || 0), 0);

    // Miles
    const totalMiles = completed
      .reduce((s, t) => s + (t.optimizedRoute?.totalDistanceMiles || 0), 0);

    // Unique riders served — collect from stops
    const uniqueRiderIds = new Set();
    for (const t of completed) {
      for (const s of (t.stops || [])) {
        if (s.type === 'pickup' && s.riderId) {
          const rid = typeof s.riderId === 'object' ? s.riderId._id?.toString() : s.riderId.toString();
          if (rid) uniqueRiderIds.add(rid);
        }
      }
    }

    // On-time metrics
    let onTimePickups = 0, latePickups = 0, onTimeDropoffs = 0, lateDropoffs = 0;
    for (const t of completed) {
      for (const s of (t.stops || [])) {
        if (s.type === 'pickup' && s.actualArrival && s.scheduledTime) {
          if (new Date(s.actualArrival) <= new Date(s.scheduledTime)) onTimePickups++;
          else latePickups++;
        }
        if (s.type === 'dropoff' && s.actualDeparture && s.appointmentTime) {
          if (new Date(s.actualDeparture) <= new Date(s.appointmentTime)) onTimeDropoffs++;
          else lateDropoffs++;
        }
      }
    }

    // Trips by payment type
    const byPaymentType = {};
    for (const t of completed) {
      const type = t.payment?.type || 'none';
      byPaymentType[type] = (byPaymentType[type] || 0) + 1;
    }

    // Trips by day of week (0=Sun..6=Sat)
    const byDayOfWeek = [0,0,0,0,0,0,0];
    for (const t of completed) {
      const day = new Date(t.tripDate).getDay();
      byDayOfWeek[day]++;
    }

    // Trips per week (for trend line)
    const weekMap = {};
    for (const t of completed) {
      const d = new Date(t.tripDate);
      const day = d.getDay();
      const diff = (day === 0 ? -6 : 1) - day;
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() + diff);
      weekStart.setHours(0,0,0,0);
      const key = weekStart.toISOString().slice(0,10);
      weekMap[key] = (weekMap[key] || 0) + 1;
    }
    const tripsByWeek = Object.entries(weekMap)
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([week, count]) => ({ week, count }));

    // Zip code breakdown — from rider homeAddress via stops
    const zipMap = {};
    for (const t of completed) {
      for (const s of (t.stops || [])) {
        if (s.type === 'pickup') {
          const zip = typeof s.riderId === 'object'
            ? extractZip(s.riderId?.homeAddress || s.address)
            : extractZip(s.address);
          zipMap[zip] = (zipMap[zip] || 0) + 1;
        }
      }
    }
    const byZip = Object.entries(zipMap)
      .sort(([,a],[,b]) => b - a)
      .slice(0, 10)
      .map(([zip, count]) => ({ zip, count }));

    // Free ride code stats
    const codesIssued  = codes.length;
    const codesUsed    = codes.filter(c => c.status === 'used' || (c.freeRide?.tripsUsed || 0) > 0).length;
    const codesExpired = codes.filter(c => c.status === 'expired').length;
    const codesActive  = codes.filter(c => c.status === 'available' && c.freeRide?.expiresAt > new Date()).length;

    // Subscription stats
    const activeSubs    = subs.filter(s => s.status === 'active').length;
    const cancelledSubs = subs.filter(s => s.status === 'cancelled').length;

    // Grant breakdown (grant-funded + free_ride counted as grant service)
    const grantMap = {};
    for (const t of completed.filter(t => ['grant','free_ride'].includes(t.payment?.type))) {
      const name = t.payment?.grantName || (t.payment?.type === 'free_ride' ? 'Free Ride (Grant-Funded)' : 'Unknown Grant');
      if (!grantMap[name]) grantMap[name] = { trips: 0, value: 0 };
      grantMap[name].trips++;
      grantMap[name].value += (t.payment?.actualFare || t.payment?.estimatedFare || 0);
    }
    const byGrant = Object.entries(grantMap)
      .map(([name, d]) => ({ name, trips: d.trips, value: d.value }))
      .sort((a,b) => b.trips - a.trips);

    res.json({
      success: true,
      period: { from: from.toISOString(), to: to.toISOString() },
      trips: {
        total: trips.length,
        completed: completed.length,
        canceled: canceled.length,
        scheduled: trips.filter(t => t.status === 'scheduled').length,
        byPaymentType,
        byDayOfWeek,
        tripsByWeek,
        byGrant
      },
      riders: {
        total: riders.length,
        activeInPeriod: uniqueRiderIds.size,
        activeSubs,
        cancelledSubs
      },
      financial: {
        revenue: parseFloat(revenue.toFixed(2)),
        totalFareValue: parseFloat(totalFareValue.toFixed(2)),
        avgFarePerTrip: completed.length > 0 ? parseFloat((totalFareValue / completed.length).toFixed(2)) : 0
      },
      service: {
        totalMiles: parseFloat(totalMiles.toFixed(1)),
        avgMilesPerTrip: completed.length > 0 ? parseFloat((totalMiles / completed.length).toFixed(1)) : 0,
        byZip,
        onTime: {
          pickups: { onTime: onTimePickups, late: latePickups },
          dropoffs: { onTime: onTimeDropoffs, late: lateDropoffs }
        }
      },
      codes: { issued: codesIssued, used: codesUsed, expired: codesExpired, active: codesActive },
      grants: { available: grants.map(g => ({ _id: g._id, name: g.name, grantor: g.grantor, budget: g.totalAmount })) }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reports/grant?from=&to=&grantId=
// Grant-specific report — includes grant-funded AND free_ride trips (both are grant-supported)
router.get('/grant', async (req, res) => {
  try {
    const { from, to } = parseDateRange(req.query);
    const orgId   = req.organizationId;
    const grantId = req.query.grantId;

    // Include both 'grant' and 'free_ride' payment types
    const matchQuery = {
      organization: orgId,
      tripDate: { $gte: from, $lte: to },
      status: 'completed',
      'payment.type': { $in: ['grant', 'free_ride'] }
    };
    // If a specific grant is selected, only filter 'grant' type trips for that grant
    if (grantId) {
      matchQuery['payment.type'] = 'grant';
      matchQuery['payment.grantId'] = grantId;
    }

    const trips = await Trip.find(matchQuery)
      .populate('stops.riderId', 'riderId anonymousId homeAddress')
      .lean();

    const grantInfo = grantId ? await Grant.findById(grantId).lean() : null;

    // Unique riders (by riderId — collected from stops)
    const riderSet = new Map();
    for (const t of trips) {
      for (const stop of (t.stops || [])) {
        if (stop.type !== 'pickup' || !stop.riderId) continue;
        const rid = stop.riderId;
        const ridKey = typeof rid === 'object' ? rid._id.toString() : rid.toString();
        if (!riderSet.has(ridKey)) {
          const ridId = typeof rid === 'object'
            ? (rid.riderId || rid.anonymousId || `RWK-${ridKey.slice(-4).toUpperCase()}`)
            : ridKey.slice(-4).toUpperCase();
          riderSet.set(ridKey, {
            riderId: ridId,
            zip: typeof rid === 'object' ? extractZip(rid.homeAddress) : extractZip(stop.address),
            trips: 0,
            miles: 0,
            fareValue: 0
          });
        }
        const r = riderSet.get(ridKey);
        r.trips++;
        r.miles  += (t.optimizedRoute?.totalDistanceMiles || 0);
        // Use estimatedFare as potential revenue for grant reporting
        r.fareValue += (t.payment?.actualFare || t.payment?.estimatedFare || 0);
      }
    }

    const riderRows = Array.from(riderSet.values()).sort((a,b) => a.riderId.localeCompare(b.riderId));

    const totalTrips = trips.length;
    const totalMiles = trips.reduce((s,t) => s + (t.optimizedRoute?.totalDistanceMiles || 0), 0);
    // Potential revenue = estimated fares (what trips would have cost if not grant/free_ride funded)
    const totalValue = trips.reduce((s,t) => s + (t.payment?.actualFare || t.payment?.estimatedFare || 0), 0);
    const uniqueCount = riderSet.size;

    // Breakdown by payment type within the results
    const grantTrips    = trips.filter(t => t.payment?.type === 'grant').length;
    const freeRideTrips = trips.filter(t => t.payment?.type === 'free_ride').length;

    // On-time metrics
    let onTimePickups = 0, latePickups = 0, onTimeDropoffs = 0, lateDropoffs = 0;
    for (const t of trips) {
      for (const s of (t.stops || [])) {
        if (s.type === 'pickup' && s.actualArrival && s.scheduledTime) {
          if (new Date(s.actualArrival) <= new Date(s.scheduledTime)) onTimePickups++;
          else latePickups++;
        }
        if (s.type === 'dropoff' && s.actualDeparture && s.appointmentTime) {
          if (new Date(s.actualDeparture) <= new Date(s.appointmentTime)) onTimeDropoffs++;
          else lateDropoffs++;
        }
      }
    }

    // Trips by week
    const weekMap = {};
    for (const t of trips) {
      const d = new Date(t.tripDate);
      const day = d.getDay();
      const diff = (day === 0 ? -6 : 1) - day;
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() + diff);
      weekStart.setHours(0,0,0,0);
      const key = weekStart.toISOString().slice(0,10);
      weekMap[key] = (weekMap[key] || 0) + 1;
    }
    const tripsByWeek = Object.entries(weekMap)
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([week, count]) => ({ week, count }));

    // Zip breakdown
    const zipMap = {};
    for (const rider of riderRows) {
      zipMap[rider.zip] = (zipMap[rider.zip] || 0) + rider.trips;
    }
    const byZip = Object.entries(zipMap).sort(([,a],[,b]) => b - a).map(([zip, count]) => ({ zip, count }));

    res.json({
      success: true,
      grant: grantInfo
        ? { name: grantInfo.name, grantor: grantInfo.grantor, budget: grantInfo.totalAmount }
        : { name: 'All Grant-Funded Service (Grant + Free Ride)', grantor: null },
      period: { from: from.toISOString(), to: to.toISOString() },
      summary: {
        totalTrips,
        grantTrips,
        freeRideTrips,
        uniqueRiders: uniqueCount,
        totalMiles: parseFloat(totalMiles.toFixed(1)),
        totalFareValue: parseFloat(totalValue.toFixed(2)),
        avgMilesPerTrip: totalTrips > 0 ? parseFloat((totalMiles / totalTrips).toFixed(1)) : 0,
        costPerRider: uniqueCount > 0 ? parseFloat((totalValue / uniqueCount).toFixed(2)) : 0,
        onTime: {
          pickups:  { onTime: onTimePickups,  late: latePickups },
          dropoffs: { onTime: onTimeDropoffs, late: lateDropoffs }
        }
      },
      tripsByWeek,
      byZip,
      riderRows
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reports/trips-export?from=&to=
// CSV-ready detailed trip list (no names — rider IDs only)
router.get('/trips-export', async (req, res) => {
  try {
    const { from, to } = parseDateRange(req.query);
    const trips = await Trip.find({
      organization: req.organizationId,
      tripDate: { $gte: from, $lte: to },
      status: 'completed'
    }).populate('stops.riderId', 'riderId anonymousId')
      .populate('vehicle', 'name')
      .lean();

    const rows = trips.map(t => {
      const firstPickup = (t.stops || []).find(s => s.type === 'pickup');
      const rid = typeof firstPickup?.riderId === 'object'
        ? (firstPickup.riderId?.riderId || firstPickup.riderId?.anonymousId || '—')
        : '—';
      return {
        tripNumber:    t.tripNumber || '',
        date:          new Date(t.tripDate).toLocaleDateString('en-US'),
        riderId:       rid,
        vehicle:       t.vehicle?.name || '—',
        paymentType:   t.payment?.type || '—',
        grantName:     t.payment?.grantName || (t.payment?.type === 'free_ride' ? 'Free Ride' : ''),
        estimatedFare: (t.payment?.estimatedFare || 0).toFixed(2),
        actualFare:    (t.payment?.actualFare    || 0).toFixed(2),
        miles:         (t.optimizedRoute?.totalDistanceMiles || 0).toFixed(1)
      };
    });

    res.json({ success: true, rows, period: { from: from.toISOString(), to: to.toISOString() } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
