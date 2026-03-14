import { Router } from 'express';
import Stripe from 'stripe';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured.');
  return new Stripe(key);
}

// POST /api/payments/create-intent
router.post('/create-intent', authenticate as any, async (req: AuthRequest, res) => {
  try {
    const { amount, currency = 'usd', riderId, tripId, description } = req.body;
    if (!amount || amount <= 0) {
      res.status(400).json({ success: false, error: 'Valid amount is required.' });
      return;
    }

    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // convert to cents
      currency,
      metadata: {
        riderId:        riderId  || '',
        tripId:         tripId   || '',
        organizationId: req.organizationId?.toString() || '',
        description:    description || 'RydeWorks ride payment'
      },
      description: description || 'RydeWorks ride payment'
    });

    res.json({
      success: true,
      clientSecret:     paymentIntent.client_secret,
      paymentIntentId:  paymentIntent.id
    });
  } catch (err: any) {
    console.error('Payment intent error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/payments/config - return publishable key to frontend
router.get('/config', (_req, res) => {
  res.json({
    success: true,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || ''
  });
});

export default router;
