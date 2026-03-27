const express = require('express');
const router  = express.Router();
const Stripe  = require('stripe');
const RiderSubscription = require('../models/RiderSubscription');
const Rider   = require('../models/Rider');
const AccessCode = require('../models/AccessCode');
const Organization = require('../models/Organization');
const Trip = require('../models/Trip');
const User = require('../models/User');
const { geocodeAddress, getDriveTime } = require('../services/routeOptimizer');

function generateCode(prefix = 'FREE') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = prefix + '-';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function sendSms(to, body) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return;
  try {
    const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await twilio.messages.create({ from: process.env.TWILIO_PHONE_NUMBER, to, body });
  } catch (err) {
    console.error('SMS error:', err.message);
  }
}

function getStripe() {
  const key = (process.env.STRIPE_SECRET_KEY || '').trim();
  if (!key) throw new Error('Payment processing is not configured. Contact support.');
  return Stripe(key);
}

async function getOrgFromRequest(req) {
  // Try subdomain first (perc.rydeworks.com → slug = 'perc')
  const host = req.hostname || '';
  const subdomain = host.split('.')[0];
  if (subdomain && subdomain !== 'rydeworks' && subdomain !== 'www') {
    const org = await Organization.findOne({ $or: [{ slug: subdomain }, { bookingSubdomain: subdomain }] });
    if (org) return org;
  }
  // Try ?org= query param
  if (req.query.org) {
    const org = await Organization.findOne({ $or: [{ slug: req.query.org }, { bookingSubdomain: req.query.org }] });
    if (org) return org;
  }
  // Default: first org
  return Organization.findOne({}).sort({ createdAt: 1 });
}

// GET /api/book/org-config — public, returns org branding for booking page
router.get('/org-config', async (req, res) => {
  try {
    const org = await getOrgFromRequest(req);
    if (!org) return res.json({ success: false, error: 'Organization not found.' });
    res.json({
      success: true,
      org: {
        name: org.name,
        appName: org.appName,
        slug: org.slug,
        primaryColor: org.primaryColor,
        venmoHandle: org.selfPayConfig?.venmoHandle || '',
        cashAppHandle: org.selfPayConfig?.cashAppHandle || '',
        venmoQrUrl: org.selfPayConfig?.venmoQrUrl || '',
        cashAppQrUrl: org.selfPayConfig?.cashAppQrUrl || '',
        dispatchPhone: org.phone || '(727) 313-1241'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/book/stripe-key
router.get('/stripe-key', (req, res) => {
  const key = (process.env.STRIPE_PUBLISHABLE_KEY || '').trim();
  if (!key) return res.status(503).json({ error: 'Payment processing is not configured.' });
  res.json({ publishableKey: key });
});

// GET /api/book/check-subscriber?phone=... — check if phone already has active subscription
router.get('/check-subscriber', async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.json({ exists: false });
    const clean = phone.replace(/\D/g, '');
    const sub = await RiderSubscription.findOne({ phone: clean, status: 'active' });
    if (!sub) return res.json({ exists: false });
    res.json({
      exists: true,
      hasPaymentMethod: !!(sub.stripeCustomerId || sub.stripePaymentMethodId || sub.venmoHandle || sub.cashAppHandle || sub.employer?.name),
      paymentMethodType: sub.paymentMethodType || null,
      freeRideCode: sub.freeRideCode || null,
      codeExpiresAt: sub.codeExpiresAt || null,
      firstName: sub.firstName,
      enrollmentId: sub._id
    });
  } catch (err) {
    res.json({ exists: false });
  }
});

// GET /api/book/check-availability
router.get('/check-availability', async (req, res) => {
  try {
    const { date, time } = req.query;
    if (!date || !time) return res.json({ available: true, tripsAtTime: 0 });
    const org = await getOrgFromRequest(req);
    if (!org) return res.json({ available: true, tripsAtTime: 0 });
    const base = new Date(`${date}T${time}:00-05:00`);
    const windowStart = new Date(base.getTime() - 45 * 60 * 1000);
    const windowEnd   = new Date(base.getTime() + 45 * 60 * 1000);
    const trips = await Trip.find({
      organization: org._id,
      status: { $nin: ['canceled', 'completed'] },
      tripDate: { $gte: new Date(`${date}T00:00:00-05:00`), $lte: new Date(`${date}T23:59:59-05:00`) }
    }).select('stops');
    let tripsAtTime = 0;
    for (const trip of trips) {
      const hasOverlap = (trip.stops || []).some(s => {
        if (s.type !== 'pickup') return false;
        const t = s.scheduledTime ? new Date(s.scheduledTime).getTime() : null;
        return t && t >= windowStart.getTime() && t <= windowEnd.getTime();
      });
      if (hasOverlap) tripsAtTime++;
    }
    const suggestions = [];
    for (const offsetMins of [-60, -30, 30, 60, 90]) {
      if (suggestions.length >= 3) break;
      const altBase = new Date(base.getTime() + offsetMins * 60 * 1000);
      const altStart = new Date(altBase.getTime() - 45 * 60 * 1000);
      const altEnd   = new Date(altBase.getTime() + 45 * 60 * 1000);
      let altCount = 0;
      for (const trip of trips) {
        const hasOverlap = (trip.stops || []).some(s => {
          if (s.type !== 'pickup') return false;
          const t = s.scheduledTime ? new Date(s.scheduledTime).getTime() : null;
          return t && t >= altStart.getTime() && t <= altEnd.getTime();
        });
        if (hasOverlap) altCount++;
      }
      if (altCount < tripsAtTime) {
        const h = altBase.getUTCHours().toString().padStart(2, '0');
        const m = altBase.getUTCMinutes().toString().padStart(2, '0');
        suggestions.push(`${h}:${m}`);
      }
    }
    res.json({ available: tripsAtTime < 3, tripsAtTime, suggestions });
  } catch (err) {
    res.json({ available: true, tripsAtTime: 0 });
  }
});

// POST /api/book/log-trip-request — create a new trip request for an existing subscriber (no re-enrollment)
router.post('/log-trip-request', async (req, res) => {
  try {
    const { firstName, lastName, phone, homeAddress, recurringData } = req.body;
    if (!firstName || !lastName || !phone) return res.json({ success: false });

    const org = await getOrgFromRequest(req);
    if (!org) return res.json({ success: false });

    const rider = await Rider.findOne({ phone: phone.replace(/\D/g, ''), organization: org._id });
    if (!rider) return res.json({ success: false, error: 'Rider not found.' });

    const isDST = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).format(new Date()).includes('EDT');
    const offset = isDST ? '-04:00' : '-05:00';
    const easternDate = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const [m, d, y] = easternDate.split('/');
    const todayStr = `${y}-${m}-${d}`;

    const tripDateStr = recurringData?.startDate || todayStr;
    const tripDate = new Date(`${tripDateStr}T12:00:00${offset}`);

    const stops = [];
    let stopOrder = 0;
    if (recurringData?.pickupAddress) {
      const pickupTime = recurringData.pickupTime ? new Date(`${tripDateStr}T${recurringData.pickupTime}:00${offset}`) : null;
      const apptTime   = recurringData.appointmentTime ? new Date(`${tripDateStr}T${recurringData.appointmentTime}:00${offset}`) : null;
      stops.push({ stopOrder: stopOrder++, type: 'pickup', address: recurringData.pickupAddress, riderId: rider._id, riderName: `${firstName} ${lastName}`, riderPhone: phone.replace(/\D/g,''), scheduledTime: pickupTime, appointmentTime: apptTime });
      if (recurringData.destination) {
        stops.push({ stopOrder: stopOrder++, type: 'dropoff', address: recurringData.destination, riderId: rider._id, riderName: `${firstName} ${lastName}` });
      }
      if (recurringData.tripType === 'round_trip' && recurringData.returnTime) {
        const returnTime = new Date(`${tripDateStr}T${recurringData.returnTime}:00${offset}`);
        stops.push({ stopOrder: stopOrder++, type: 'pickup', address: recurringData.destination, riderId: rider._id, riderName: `${firstName} ${lastName}`, riderPhone: phone.replace(/\D/g,''), scheduledTime: returnTime });
        stops.push({ stopOrder: stopOrder++, type: 'dropoff', address: recurringData.pickupAddress, riderId: rider._id, riderName: `${firstName} ${lastName}` });
      }
    } else {
      stops.push({ stopOrder: 0, type: 'pickup', address: homeAddress || 'See rider profile', riderId: rider._id, riderName: `${firstName} ${lastName}`, riderPhone: phone.replace(/\D/g,'') });
    }

    await Trip.create({
      organization: org._id,
      rider: rider._id,
      status: 'scheduled',
      tripDate,
      stops,
      payment: { type: 'self_pay', estimatedFare: 0 },
      notes: recurringData
        ? `Trip request via booking portal (existing subscriber). ${recurringData.repeatDays?.length ? 'Recurring: ' + recurringData.repeatDays.join(', ') + '.' : 'One-time trip.'}`
        : `Trip request via booking portal (existing subscriber) — no schedule entered yet. Contact rider to confirm details.`,
      source: 'self_booked'
    });

    const dispatchPhone = process.env.DISPATCH_PHONE || org?.phone;
    if (dispatchPhone) {
      const tripInfo = recurringData?.pickupAddress
        ? `${recurringData.pickupAddress} → ${recurringData.destination || 'TBD'}`
        : homeAddress || 'address on file';
      await sendSms(dispatchPhone, `TRIP REQUEST: ${firstName} ${lastName} (${phone}) — existing subscriber needs a driver assigned. Pickup: ${tripInfo}. Assign driver in dispatch app.`);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('log-trip-request error:', err);
    res.json({ success: false });
  }
});

// POST /api/book/check-feasibility — check if a trip can be served given current driver availability + live traffic
router.post('/check-feasibility', async (req, res) => {
  try {
    const { pickupAddress, destination, appointmentTime, date } = req.body;
    if (!pickupAddress || !destination || !appointmentTime || !date) {
      return res.json({ feasible: null, reason: 'missing_fields' });
    }

    const org = await getOrgFromRequest(req);
    if (!org) return res.json({ feasible: null, reason: 'org_not_found' });

    // Parse appointment datetime (Eastern time)
    const isDST = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).format(new Date()).includes('EDT');
    const offset = isDST ? '-04:00' : '-05:00';
    const apptDt = new Date(`${date}T${appointmentTime}:00${offset}`);
    const nowMs = Date.now();

    // Geocode pickup and destination in parallel
    let pickupCoords, destCoords;
    try {
      [pickupCoords, destCoords] = await Promise.all([
        geocodeAddress(pickupAddress),
        geocodeAddress(destination)
      ]);
    } catch (geoErr) {
      return res.json({ feasible: null, reason: 'geocode_failed' });
    }

    // Calculate pickup→destination drive time (for suggested pickup time)
    let pickupToDest;
    try {
      pickupToDest = await getDriveTime(pickupCoords, destCoords);
    } catch (e) {
      return res.json({ feasible: null, reason: 'routing_failed' });
    }

    // Suggested pickup time = appointment - (pickup→dest + 15 min buffer)
    const bufferMins = 15;
    const suggestedPickupMs = apptDt.getTime() - (pickupToDest.durationMins + bufferMins) * 60 * 1000;
    const suggestedPickupDt = new Date(suggestedPickupMs);
    // Format in Eastern time (same timezone as appointment)
    const etFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
    const etParts = etFormatter.formatToParts(suggestedPickupDt);
    const etHour = etParts.find(p => p.type === 'hour').value;
    const etMin  = etParts.find(p => p.type === 'minute').value;
    const suggestedPickupTime = `${etHour.padStart(2,'0')}:${etMin.padStart(2,'0')}`;

    // Find available drivers in this org with GPS location
    const drivers = await User.find({
      organization: org._id,
      roles: { $in: ['driver', 'admin'] },
      'driverInfo.isAvailable': true,
      'driverInfo.currentLocation.lat': { $exists: true },
      'driverInfo.currentLocation.lng': { $exists: true }
    }).select('driverInfo.currentLocation firstName lastName');

    if (drivers.length === 0) {
      return res.json({
        feasible: false,
        reason: 'no_drivers_available',
        suggestedPickupTime,
        pickupToDest: pickupToDest.durationMins,
        pendingDispatchNotification: false
      });
    }

    // Check if any driver can reach pickup in time and deliver before appointment
    let anyFeasible = false;
    for (const driver of drivers) {
      const driverLoc = driver.driverInfo.currentLocation;
      let driverToPickup;
      try {
        driverToPickup = await getDriveTime(driverLoc, pickupCoords);
      } catch (e) {
        continue;
      }
      // Driver must reach pickup + buffer + drive to dest before appointment
      const totalMins = driverToPickup.durationMins + bufferMins + pickupToDest.durationMins;
      const earliestArrival = nowMs + totalMins * 60 * 1000;
      if (earliestArrival <= apptDt.getTime()) {
        anyFeasible = true;
        break;
      }
    }

    if (!anyFeasible) {
      return res.json({
        feasible: false,
        reason: 'no_driver_in_time',
        suggestedPickupTime,
        pickupToDest: pickupToDest.durationMins,
        pendingDispatchNotification: false
      });
    }

    return res.json({
      feasible: true,
      suggestedPickupTime,
      pickupToDest: pickupToDest.durationMins,
      pendingDispatchNotification: false
    });

  } catch (err) {
    console.error('check-feasibility error:', err);
    res.json({ feasible: null, reason: 'server_error' });
  }
});

// POST /api/book/setup-intent — create Stripe SetupIntent to save card without charging
router.post('/setup-intent', async (req, res) => {
  try {
    const { firstName, lastName, phone, email } = req.body;
    if (!firstName || !lastName || !phone) {
      return res.status(400).json({ success: false, error: 'Name and phone are required.' });
    }
    const stripe = getStripe();
    // Find or create Stripe customer
    let customer;
    const existing = await RiderSubscription.findOne({ phone: phone.replace(/\D/g, ''), stripeCustomerId: { $exists: true, $ne: '' } });
    if (existing?.stripeCustomerId) {
      customer = await stripe.customers.retrieve(existing.stripeCustomerId).catch(() => null);
    }
    if (!customer || customer.deleted) {
      customer = await stripe.customers.create({
        name: `${firstName} ${lastName}`,
        email: email || undefined,
        phone,
        metadata: { firstName, lastName, phone }
      });
    }
    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: ['card'],
      usage: 'off_session'
    });
    res.json({ success: true, clientSecret: setupIntent.client_secret, customerId: customer.id });
  } catch (err) {
    console.error('SetupIntent error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/book/enroll — main enrollment, no upfront charge
router.post('/enroll', async (req, res) => {
  try {
    const {
      firstName, lastName, phone, email, homeAddress,
      paymentMethodType = 'card',
      paymentMethodId,    // Stripe PM id (for card/ach)
      stripeCustomerId,   // from setup-intent step
      venmoHandle,        // rider's venmo
      cashAppHandle,      // rider's cashapp
      employerName, employerContact, employerEmail, deductionSchedule,
      recurringData,
      weeklyEstimatedFare = 0
    } = req.body;

    if (!firstName || !lastName || !phone) {
      return res.status(400).json({ success: false, error: 'Missing required fields.' });
    }

    // Check if already enrolled
    const existing = await RiderSubscription.findOne({ phone: phone.replace(/\D/g, ''), status: 'active' });
    if (existing) {
      return res.status(400).json({ success: false, error: 'A subscription already exists for this phone number. Please contact us if you need help.' });
    }

    const org = await getOrgFromRequest(req);

    // For Stripe payment methods: attach PM to customer
    let stripeCustomerIdFinal = stripeCustomerId || null;
    if ((paymentMethodType === 'card' || paymentMethodType === 'ach') && paymentMethodId && stripeCustomerIdFinal) {
      try {
        const stripe = getStripe();
        await stripe.paymentMethods.attach(paymentMethodId, { customer: stripeCustomerIdFinal });
        await stripe.customers.update(stripeCustomerIdFinal, {
          invoice_settings: { default_payment_method: paymentMethodId }
        });
      } catch (stripeErr) {
        console.error('Stripe attach error (non-fatal):', stripeErr.message);
      }
    }

    // Generate free ride code (30 days)
    const code = generateCode('FREE');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Calculate minimum commitment (1 week of estimated fares)
    const minimumCommitmentAmount = Math.max(0, parseFloat(weeklyEstimatedFare) || 0);

    // Find or create rider record
    let rider = null;
    try {
      if (org) {
        rider = await Rider.findOne({ phone: phone.replace(/\D/g, ''), organization: org._id });
        if (!rider) {
          const updatedOrg = await Organization.findByIdAndUpdate(
            org._id, { $inc: { riderSequence: 1 } }, { new: true }
          );
          const prefix = (updatedOrg.reportingPrefix || updatedOrg.slug || 'RWK').substring(0, 3).toUpperCase();
          const riderId = `${prefix}-${String(updatedOrg.riderSequence).padStart(4, '0')}`;
          rider = await Rider.create({
            organization: org._id, riderId,
            firstName, lastName,
            phone: phone.replace(/\D/g, ''),
            email, homeAddress, isActive: true
          });
        }
      }
    } catch (riderErr) {
      console.error('Rider creation error (non-fatal):', riderErr.message);
    }

    // Create subscription
    const subData = {
      rider: rider?._id,
      organization: org?._id,
      firstName, lastName,
      phone: phone.replace(/\D/g, ''),
      email, homeAddress,
      paymentMethodType,
      stripeCustomerId: stripeCustomerIdFinal,
      stripePaymentMethodId: paymentMethodId || null,
      venmoHandle: venmoHandle || null,
      cashAppHandle: cashAppHandle || null,
      creditBalance: 0,
      freeRideCode: code,
      codeExpiresAt: expiresAt,
      weeklyEstimatedFare: minimumCommitmentAmount,
      minimumCommitmentAmount,
      status: 'active',
      termsAcceptedAt: new Date(),
      termsAcceptedIp: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null,
      termsVersion: '2026-03-26'
    };

    if (paymentMethodType === 'payroll_deduction') {
      subData.employer = {
        name: employerName,
        contactName: employerContact,
        contactEmail: employerEmail,
        deductionSchedule: deductionSchedule || 'weekly'
      };
    }

    const sub = await RiderSubscription.create(subData);

    // Create AccessCode record
    try {
      await AccessCode.create({
        organization: rider?.organization,
        rider: rider?._id,
        code, type: 'free_ride', expiresAt, isActive: true,
        notes: 'Self-enrolled via booking portal'
      });
    } catch (codeErr) {
      console.error('AccessCode error (non-fatal):', codeErr.message);
    }

    // Always create a booking request trip so dispatcher is notified
    if (rider && org) {
      try {
        const isDST = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).format(new Date()).includes('EDT');
        const offset = isDST ? '-04:00' : '-05:00';
        const easternDate = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const [m, d, y] = easternDate.split('/');
        const todayStr = `${y}-${m}-${d}`;

        // Use startDate from recurringData if provided, otherwise today
        const tripDateStr = recurringData?.startDate || todayStr;
        const tripDate = new Date(`${tripDateStr}T12:00:00${offset}`);

        const stops = [];
        let stopOrder = 0;
        if (recurringData?.pickupAddress) {
          const pickupTime = recurringData.pickupTime ? new Date(`${tripDateStr}T${recurringData.pickupTime}:00${offset}`) : null;
          const apptTime   = recurringData.appointmentTime ? new Date(`${tripDateStr}T${recurringData.appointmentTime}:00${offset}`) : null;
          stops.push({ stopOrder: stopOrder++, type: 'pickup', address: recurringData.pickupAddress, riderId: rider._id, riderName: `${firstName} ${lastName}`, riderPhone: phone.replace(/\D/g,''), scheduledTime: pickupTime, appointmentTime: apptTime });
          if (recurringData.destination) {
            stops.push({ stopOrder: stopOrder++, type: 'dropoff', address: recurringData.destination, riderId: rider._id, riderName: `${firstName} ${lastName}` });
          }
          if (recurringData.tripType === 'round_trip' && recurringData.returnTime) {
            const returnTime = new Date(`${tripDateStr}T${recurringData.returnTime}:00${offset}`);
            stops.push({ stopOrder: stopOrder++, type: 'pickup', address: recurringData.destination, riderId: rider._id, riderName: `${firstName} ${lastName}`, riderPhone: phone.replace(/\D/g,''), scheduledTime: returnTime });
            stops.push({ stopOrder: stopOrder++, type: 'dropoff', address: recurringData.pickupAddress, riderId: rider._id, riderName: `${firstName} ${lastName}` });
          }
        } else {
          // No schedule provided — create a bare pickup stop from home address so dispatcher sees the request
          stops.push({ stopOrder: 0, type: 'pickup', address: homeAddress || 'See rider profile', riderId: rider._id, riderName: `${firstName} ${lastName}`, riderPhone: phone.replace(/\D/g,'') });
        }

        const payType = (paymentMethodType === 'venmo' || paymentMethodType === 'cashapp' || paymentMethodType === 'self_pay') ? 'self_pay' : paymentMethodType === 'payroll_deduction' ? 'none' : 'self_pay';
        await Trip.create({
          organization: org._id,
          rider: rider._id,
          status: 'scheduled',
          tripDate,
          stops,
          payment: { type: payType, estimatedFare: 0 },
          notes: recurringData
            ? `Self-booked via booking portal. ${recurringData.repeatDays?.length ? 'Recurring: ' + recurringData.repeatDays.join(', ') + '.' : 'One-time trip.'} Payment: ${paymentMethodType}.`
            : `Self-booked via booking portal — no schedule entered yet. Contact rider to confirm trip details. Payment: ${paymentMethodType}.`,
          source: 'self_booked'
        });

        // Notify dispatch via SMS
        const dispatchPhone = process.env.DISPATCH_PHONE || org?.phone;
        if (dispatchPhone) {
          const tripInfo = recurringData?.pickupAddress
            ? `${recurringData.pickupAddress} → ${recurringData.destination || 'TBD'}`
            : homeAddress || 'address on file';
          await sendSms(dispatchPhone, `NEW SELF-BOOKING: ${firstName} ${lastName} (${phone}) needs a driver assigned. Pickup: ${tripInfo}. Free Ride Code: ${code}. Assign driver in dispatch app.`);
        }
      } catch (tripErr) {
        console.error('Booking trip creation error (non-fatal):', tripErr.message);
      }
    }

    // Send welcome SMS
    const expStr = expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const payLabel = paymentMethodType === 'venmo' ? 'Venmo' :
                     paymentMethodType === 'cashapp' ? 'Cash App' :
                     paymentMethodType === 'payroll_deduction' ? 'payroll deduction' :
                     'card on file';
    await sendSms(phone, `Welcome to Rydeworks, ${firstName}! Your Free Ride Code is: ${code} (valid until ${expStr}). Payment method: ${payLabel}. Call (727) 313-1241 to schedule your first ride. Reply STOP to opt out.`);

    res.json({
      success: true,
      freeRideCode: code,
      codeExpiresAt: expiresAt,
      creditBalance: 0,
      enrollmentId: sub._id,
      paymentMethodType
    });

  } catch (err) {
    console.error('Enrollment error:', err);
    res.status(500).json({ success: false, error: 'Enrollment failed. Please try again or contact support.' });
  }
});

// POST /api/book/cancel-subscription — dispatcher cancels a rider's subscription
// Requires auth - this goes through admin routes, but keeping here for reference
// See admin.js for the actual endpoint

module.exports = router;
