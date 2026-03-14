const express = require('express');
const router  = express.Router();
const Stripe  = require('stripe');
const RiderSubscription = require('../models/RiderSubscription');
const Rider   = require('../models/Rider');
const AccessCode = require('../models/AccessCode');
const Organization = require('../models/Organization');

// ── Helpers ────────────────────────────────────────────────
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

// Fallback keys (used when Railway env vars are not available)
const STRIPE_SECRET_KEY_FALLBACK = 'sk_test_51T8TkFIA0FzoXeWXg91OoCvS8Wl0NxPHG7bW2q7WEMwiUlSppPs4LnIaW35kbNI636iW97hqTHRPWK660drMJVYl00zbBv07nc';
const STRIPE_PUBLISHABLE_KEY_FALLBACK = 'pk_test_51T8TkFIA0FzoXeWXVG4wUnsFgqpoVm1nwb46uYWgudgbtPndrrbUNkxIBlpSDw6ypYvIEWxfazSuvrAwaBJJj1FD00SOhNhFZ5';

function getStripe() {
  const key = (process.env.STRIPE_SECRET_KEY || '').trim() || STRIPE_SECRET_KEY_FALLBACK;
  return Stripe(key);
}

// ── GET /api/book/stripe-key ───────────────────────────────
// Returns the Stripe publishable key for the frontend
router.get('/stripe-key', (req, res) => {
  const key = (process.env.STRIPE_PUBLISHABLE_KEY || '').trim() || STRIPE_PUBLISHABLE_KEY_FALLBACK;
  res.json({ publishableKey: key });
});

// ── GET /api/book/debug-env (temporary) ───────────────────
router.get('/debug-env', (req, res) => {
  const stripeKeys = Object.keys(process.env).filter(k => k.toUpperCase().includes('STRIPE'));
  res.json({
    hasStripePublishable: !!process.env.STRIPE_PUBLISHABLE_KEY,
    hasStripeSecret: !!process.env.STRIPE_SECRET_KEY,
    stripePublishablePrefix: process.env.STRIPE_PUBLISHABLE_KEY ? process.env.STRIPE_PUBLISHABLE_KEY.substring(0, 12) : null,
    stripeEnvKeys: stripeKeys,
    nodeEnv: process.env.NODE_ENV
  });
});

// ── POST /api/book/enroll ──────────────────────────────────
// Creates a Stripe customer, charges $100, creates subscription record + free ride code
router.post('/enroll', async (req, res) => {
  try {
    const { firstName, lastName, phone, email, homeAddress, paymentMethodId } = req.body;
    if (!firstName || !lastName || !phone || !paymentMethodId) {
      return res.status(400).json({ success: false, error: 'Missing required fields.' });
    }

    const stripe = getStripe();

    // Check if already enrolled
    const existing = await RiderSubscription.findOne({ phone: phone.replace(/\D/g, '') });
    if (existing && existing.status === 'active') {
      return res.status(400).json({ success: false, error: 'A subscription already exists for this phone number. Please contact us if you need help.' });
    }

    // Create Stripe customer
    const customer = await stripe.customers.create({
      name: `${firstName} ${lastName}`,
      email: email || undefined,
      phone: phone,
      payment_method: paymentMethodId,
      invoice_settings: { default_payment_method: paymentMethodId }
    });

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id });

    // Create PaymentIntent for $100
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 10000, // $100.00 in cents
      currency: 'usd',
      customer: customer.id,
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      description: 'Rydeworks initial ride credit — $100',
      metadata: { firstName, lastName, phone }
    });

    if (paymentIntent.status === 'requires_action') {
      // 3D Secure needed
      const sub = await RiderSubscription.create({
        firstName, lastName,
        phone: phone.replace(/\D/g, ''),
        email, homeAddress,
        stripeCustomerId: customer.id,
        stripePaymentMethodId: paymentMethodId,
        creditBalance: 0,
        status: 'suspended', // pending payment confirmation
        payments: [{ amount: 100, stripePaymentIntentId: paymentIntent.id, type: 'initial' }]
      });
      return res.json({
        success: true,
        requiresAction: true,
        clientSecret: paymentIntent.client_secret,
        enrollmentId: sub._id
      });
    }

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ success: false, error: 'Payment failed. Please check your card details and try again.' });
    }

    // Generate free ride code
    const code = generateCode('FREE');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Find or create rider record in the default org
    let rider = null;
    try {
      const org = await Organization.findOne({}).sort({ createdAt: 1 });
      if (org) {
        rider = await Rider.findOne({ phone: phone.replace(/\D/g, ''), organization: org._id });
        if (!rider) {
          // Get next riderId
          const count = await Rider.countDocuments({ organization: org._id });
          const prefix = (org.slug || org.name || 'RYD').substring(0, 3).toUpperCase();
          const riderId = `${prefix}-${String(count + 1).padStart(4, '0')}`;
          rider = await Rider.create({
            organization: org._id,
            riderId,
            firstName, lastName,
            phone: phone.replace(/\D/g, ''),
            email, homeAddress,
            isActive: true
          });
        }
      }
    } catch (riderErr) {
      console.error('Rider creation error (non-fatal):', riderErr.message);
    }

    // Create subscription record
    const sub = await RiderSubscription.create({
      rider: rider?._id,
      firstName, lastName,
      phone: phone.replace(/\D/g, ''),
      email, homeAddress,
      stripeCustomerId: customer.id,
      stripePaymentMethodId: paymentMethodId,
      creditBalance: 100.00,
      freeRideCode: code,
      codeExpiresAt: expiresAt,
      status: 'active',
      payments: [{ amount: 100, stripePaymentIntentId: paymentIntent.id, type: 'initial' }]
    });

    // Also create AccessCode record so dispatcher can look it up
    try {
      await AccessCode.create({
        organization: rider?.organization,
        rider: rider?._id,
        code,
        type: 'free_ride',
        expiresAt,
        isActive: true,
        notes: 'Self-enrolled via booking portal'
      });
    } catch (codeErr) {
      console.error('AccessCode creation error (non-fatal):', codeErr.message);
    }

    // Send confirmation SMS
    const expStr = expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    await sendSms(phone, `Welcome to Rydeworks, ${firstName}! Your Free Ride Code is: ${code} (valid until ${expStr}). Your $100 credit balance is ready. Reply HELP for assistance.`);

    res.json({
      success: true,
      freeRideCode: code,
      codeExpiresAt: expiresAt,
      creditBalance: 100.00,
      enrollmentId: sub._id
    });

  } catch (err) {
    console.error('Enrollment error:', err);
    const msg = err.type === 'StripeCardError' ? err.message : 'Enrollment failed. Please try again or contact support.';
    res.status(500).json({ success: false, error: msg });
  }
});

// ── POST /api/book/confirm-payment ────────────────────────
// Confirms a 3D Secure payment and activates the subscription
router.post('/confirm-payment', async (req, res) => {
  try {
    const { enrollmentId } = req.body;
    const sub = await RiderSubscription.findById(enrollmentId);
    if (!sub) return res.status(404).json({ success: false, error: 'Enrollment not found.' });

    const stripe = getStripe();
    const pi = sub.payments[0]?.stripePaymentIntentId;
    if (!pi) return res.status(400).json({ success: false, error: 'No payment intent found.' });

    const paymentIntent = await stripe.paymentIntents.retrieve(pi);
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ success: false, error: 'Payment not confirmed yet.' });
    }

    // Generate code and activate
    const code = generateCode('FREE');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    sub.freeRideCode = code;
    sub.codeExpiresAt = expiresAt;
    sub.creditBalance = 100.00;
    sub.status = 'active';
    await sub.save();

    const expStr = expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    await sendSms(sub.phone, `Welcome to Rydeworks, ${sub.firstName}! Your Free Ride Code is: ${code} (valid until ${expStr}). Your $100 credit balance is ready.`);

    res.json({ success: true, freeRideCode: code, codeExpiresAt: expiresAt, creditBalance: 100.00 });
  } catch (err) {
    console.error('Confirm payment error:', err);
    res.status(500).json({ success: false, error: 'Confirmation failed.' });
  }
});

module.exports = router;
// redeploy Sat Mar  7 18:44:09 EST 2026
