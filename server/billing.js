// Weekly billing — runs every Friday, charges riders for trips taken that week
const mongoose = require('mongoose');
const RiderSubscription = require('./models/RiderSubscription');
const Trip = require('./models/Trip');
const Organization = require('./models/Organization');

async function runWeeklyBilling() {
  // Get the date range for the past week (Mon-Sun)
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setHours(23, 59, 59, 999);
  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekStart.getDate() - 7);

  const activeSubs = await RiderSubscription.find({
    status: 'active',
    weeklyBillingEnabled: true,
    freeRideUsed: true, // only bill after free ride period ends
    paymentMethodType: { $in: ['card', 'ach'] }, // only auto-charge these
    stripeCustomerId: { $exists: true, $ne: null },
    stripePaymentMethodId: { $exists: true, $ne: null }
  }).populate('rider');

  const Stripe = require('stripe');
  const stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY.trim()) : null;
  if (!stripe) { console.warn('Billing: no Stripe key configured'); return; }

  let charged = 0, failed = 0, skipped = 0;

  for (const sub of activeSubs) {
    try {
      // Find completed trips for this rider this week
      const trips = await Trip.find({
        'stops.riderId': sub.rider?._id,
        status: 'completed',
        tripDate: { $gte: weekStart, $lte: weekEnd }
      });

      // Calculate total fare for rider's stops this week
      let weeklyTotal = 0;
      for (const trip of trips) {
        const fare = trip.payment?.actualFare || trip.payment?.estimatedFare || 0;
        weeklyTotal += Number(fare);
      }

      if (weeklyTotal <= 0) { skipped++; continue; }

      // Charge via Stripe
      const pi = await stripe.paymentIntents.create({
        amount: Math.round(weeklyTotal * 100),
        currency: 'usd',
        customer: sub.stripeCustomerId,
        payment_method: sub.stripePaymentMethodId,
        confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        description: `Rydeworks weekly trip charges — week ending ${weekEnd.toLocaleDateString()}`,
        metadata: { subscriptionId: sub._id.toString(), weekEnd: weekEnd.toISOString() }
      });

      sub.payments.push({
        amount: weeklyTotal,
        method: 'card',
        stripePaymentIntentId: pi.id,
        type: 'weekly',
        note: `Weekly billing — ${trips.length} trip(s), week ending ${weekEnd.toLocaleDateString()}`
      });
      sub.lastBilledAt = now;
      await sub.save();
      charged++;

      // SMS receipt
      if (sub.phone && process.env.TWILIO_ACCOUNT_SID) {
        try {
          const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
          await twilio.messages.create({
            from: process.env.TWILIO_PHONE_NUMBER,
            to: sub.phone,
            body: `Rydeworks: Your weekly transportation charge of $${weeklyTotal.toFixed(2)} for ${trips.length} trip(s) has been processed. Questions? Call (727) 313-1241. Reply STOP to opt out.`
          });
        } catch (smsErr) { /* silent */ }
      }

    } catch (err) {
      console.error(`Billing failed for sub ${sub._id}:`, err.message);
      failed++;
    }
  }

  console.log(`Weekly billing complete: ${charged} charged, ${failed} failed, ${skipped} skipped (no trips)`);
}

// Also run a check to expire free ride codes and switch to self-pay
async function expireFreeRideCodes() {
  const now = new Date();
  const expiredSubs = await RiderSubscription.find({
    status: 'active',
    codeExpiresAt: { $lt: now },
    freeRideUsed: false
  });
  for (const sub of expiredSubs) {
    sub.freeRideUsed = true;
    sub.weeklyBillingEnabled = true;
    await sub.save();
    console.log(`Free ride expired for sub ${sub._id} — switched to self-pay`);
  }
}

module.exports = { runWeeklyBilling, expireFreeRideCodes };
