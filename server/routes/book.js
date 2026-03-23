const express = require('express');
const router  = express.Router();
const Stripe  = require('stripe');
const RiderSubscription = require('../models/RiderSubscription');
const Rider   = require('../models/Rider');
const AccessCode = require('../models/AccessCode');
const Organization = require('../models/Organization');
const Trip = require('../models/Trip');

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
      status: 'active'
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
