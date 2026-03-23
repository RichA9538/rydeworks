const express = require('express');
const router  = express.Router();
const Trip    = require('../models/Trip');
const Rider   = require('../models/Rider');
const RiderSubscription = require('../models/RiderSubscription');
const Grant   = require('../models/Grant');
const AccessCode = require('../models/AccessCode');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('admin', 'dispatcher'));

// Helper: parse date range from query, default to current month
function parseDateRange(query) {
  const now = new Date();
  let from = query.from ? new Date(query.from) : new Date(now.getFullYear(), now.getMonth(), 1);
  let to   = query.to   ? new Date(query.to)   : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
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
          .populate('riderId', 'riderId homeAddress')
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

    // Total fare value (all trips including grant-funded)
    const totalFareValue = completed
      .reduce((s, t) => s + (t.payment?.actualFare || t.payment?.estimatedFare || 0), 0);

    // Miles
    const totalMiles = completed
      .reduce((s, t) => s + (t.optimizedRoute?.totalDistanceMiles || 0), 0);

    // Unique riders served
    const uniqueRiderIds = new Set(completed.map(t => t.riderId?._id?.toString()).filter(Boolean));

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
      // Week start = Monday
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

    // Zip code breakdown (from rider homeAddress)
    const zipMap = {};
    for (const t of completed) {
      const zip = extractZip(t.riderId?.homeAddress);
      zipMap[zip] = (zipMap[zip] || 0) + 1;
    }
    const byZip = Object.entries(zipMap)
      .sort(([,a],[,b]) => b - a)
      .slice(0, 10)
      .map(([zip, count]) => ({ zip, count }));

    // Free ride code stats
    const codesIssued  = codes.length;
    const codesUsed    = codes.filter(c => c.status === 'used' || (c.freeRide?.tripsUsed || 0) > 0).length;
    const codesExpired = codes.filter(c => c.status === 'expired').length;
    const codesActive  = codes.filter(c => c.status === 'active').length;

    // Subscription stats
    const activeSubs    = subs.filter(s => s.status === 'active').length;
    const cancelledSubs = subs.filter(s => s.status === 'cancelled').length;

    // Grant breakdown
    const grantMap = {};
    for (const t of completed.filter(t => t.payment?.type === 'grant')) {
      const name = t.payment?.grantName || 'Unknown Grant';
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
        byZip
      },
      codes: { issued: codesIssued, used: codesUsed, expired: codesExpired, active: codesActive },
      grants: { available: grants.map(g => ({ _id: g._id, name: g.name, grantor: g.grantor, budget: g.totalAmount })) }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reports/grant?from=&to=&grantId=
// Grant-specific report — anonymous, suitable for funder submission
router.get('/grant', async (req, res) => {
  try {
    const { from, to } = parseDateRange(req.query);
    const orgId   = req.organizationId;
    const grantId = req.query.grantId;

    const matchQuery = {
      organization: orgId,
      tripDate: { $gte: from, $lte: to },
      status: 'completed',
      'payment.type': 'grant'
    };
    if (grantId) matchQuery['payment.grantId'] = grantId;

    const trips = await Trip.find(matchQuery)
      .populate('riderId', 'riderId anonymousId homeAddress')
      .lean();

    const grantInfo = grantId ? await Grant.findById(grantId).lean() : null;

    // Unique riders (by riderId — anonymous display)
    const riderSet = new Map();
    for (const t of trips) {
      const rid = t.riderId;
      if (rid && !riderSet.has(rid._id.toString())) {
        riderSet.set(rid._id.toString(), {
          riderId: rid.riderId || rid.anonymousId || `RWK-${rid._id.toString().slice(-4).toUpperCase()}`,
          zip: extractZip(rid.homeAddress),
          trips: 0,
          miles: 0,
          fareValue: 0
        });
      }
      if (rid) {
        const r = riderSet.get(rid._id.toString());
        r.trips++;
        r.miles += (t.optimizedRoute?.totalDistanceMiles || 0);
        r.fareValue += (t.payment?.actualFare || t.payment?.estimatedFare || 0);
      }
    }

    const riderRows = Array.from(riderSet.values()).sort((a,b) => a.riderId.localeCompare(b.riderId));

    const totalTrips  = trips.length;
    const totalMiles  = trips.reduce((s,t) => s + (t.optimizedRoute?.totalDistanceMiles || 0), 0);
    const totalValue  = trips.reduce((s,t) => s + (t.payment?.actualFare || t.payment?.estimatedFare || 0), 0);
    const uniqueCount = riderSet.size;

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
      grant: grantInfo ? { name: grantInfo.name, grantor: grantInfo.grantor, budget: grantInfo.totalAmount } : { name: 'All Grants', grantor: null },
      period: { from: from.toISOString(), to: to.toISOString() },
      summary: {
        totalTrips,
        uniqueRiders: uniqueCount,
        totalMiles: parseFloat(totalMiles.toFixed(1)),
        totalFareValue: parseFloat(totalValue.toFixed(2)),
        avgMilesPerTrip: totalTrips > 0 ? parseFloat((totalMiles / totalTrips).toFixed(1)) : 0,
        costPerRider: uniqueCount > 0 ? parseFloat((totalValue / uniqueCount).toFixed(2)) : 0
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
    }).populate('riderId', 'riderId anonymousId')
      .populate('vehicle', 'name')
      .lean();

    const rows = trips.map(t => ({
      tripNumber:   t.tripNumber || '',
      date:         new Date(t.tripDate).toLocaleDateString('en-US'),
      riderId:      t.riderId?.riderId || t.riderId?.anonymousId || '—',
      vehicle:      t.vehicle?.name || '—',
      paymentType:  t.payment?.type || '—',
      grantName:    t.payment?.grantName || '',
      estimatedFare: (t.payment?.estimatedFare || 0).toFixed(2),
      actualFare:    (t.payment?.actualFare    || 0).toFixed(2),
      miles:         (t.optimizedRoute?.totalDistanceMiles || 0).toFixed(1)
    }));

    res.json({ success: true, rows, period: { from: from.toISOString(), to: to.toISOString() } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
