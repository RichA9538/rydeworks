/**
 * Public rider portal routes — no auth required.
 * Riders identify via phone + org slug.
 */
import { Router } from 'express';
import { Organization } from '../models/Organization.js';
import { Rider } from '../models/Rider.js';
import { Trip } from '../models/Trip.js';
import { geocodeAddress } from '../lib/geocode.js';

const router = Router();

// GET /api/rider-portal/org/:slug — get org info for rider portal branding
router.get('/org/:slug', async (req, res) => {
  try {
    const org = await Organization.findOne({ slug: req.params.slug, isActive: true })
      .select('name slug appName primaryColor accentColor homeBases fareZones');
    if (!org) { res.status(404).json({ success: false, error: 'Organization not found.' }); return; }
    res.json({ success: true, org });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/rider-portal/lookup — find or create rider by phone
router.post('/lookup', async (req, res) => {
  try {
    const { phone, orgSlug } = req.body;
    if (!phone || !orgSlug) { res.status(400).json({ success: false, error: 'Phone and org are required.' }); return; }

    const org = await Organization.findOne({ slug: orgSlug, isActive: true });
    if (!org) { res.status(404).json({ success: false, error: 'Organization not found.' }); return; }

    const normalizedPhone = phone.replace(/\D/g, '');
    const rider = await Rider.findOne({ organization: org._id, phone: { $regex: normalizedPhone } });
    if (!rider) { res.status(404).json({ success: false, error: 'No rider found with that phone number. Please contact your dispatcher to register.' }); return; }

    res.json({ success: true, rider: { _id: (rider as any)._id, riderId: (rider as any).riderId, firstName: (rider as any).firstName, lastName: (rider as any).lastName, homeAddress: (rider as any).homeAddress, commonDestinations: (rider as any).commonDestinations } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/rider-portal/trips/:riderId — get upcoming trips for rider
router.get('/trips/:riderId', async (req, res) => {
  try {
    const rider = await Rider.findById(req.params.riderId);
    if (!rider) { res.status(404).json({ success: false, error: 'Rider not found.' }); return; }

    const now = new Date();
    const trips = await Trip.find({
      organization: (rider as any).organization,
      'stops.riderId': (rider as any)._id.toString(),
      tripDate: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      status: { $nin: ['canceled'] }
    })
      .populate('driver', 'firstName lastName phone')
      .populate('vehicle', 'name color')
      .sort({ tripDate: 1 })
      .limit(20);

    res.json({ success: true, trips });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/rider-portal/request — submit a trip request
router.post('/request', async (req, res) => {
  try {
    const { riderId, orgSlug, pickupAddress, dropoffAddress, appointmentTime, tripDate, notes, isRoundTrip } = req.body;
    if (!riderId || !orgSlug || !pickupAddress || !dropoffAddress || !tripDate) {
      res.status(400).json({ success: false, error: 'Missing required fields.' }); return;
    }

    const org = await Organization.findOne({ slug: orgSlug, isActive: true });
    if (!org) { res.status(404).json({ success: false, error: 'Organization not found.' }); return; }

    const rider = await Rider.findById(riderId);
    if (!rider) { res.status(404).json({ success: false, error: 'Rider not found.' }); return; }

    const [pickupGeo, dropoffGeo] = await Promise.all([
      geocodeAddress(pickupAddress),
      geocodeAddress(dropoffAddress),
    ]);

    const stops: any[] = [
      {
        type: 'pickup',
        address: pickupAddress,
        riderId: (rider as any)._id.toString(),
        riderName: `${(rider as any).firstName} ${(rider as any).lastName}`,
        lat: pickupGeo?.lat,
        lng: pickupGeo?.lng,
        stopOrder: 0,
        status: 'pending',
        appointmentTime: appointmentTime ? new Date(appointmentTime) : undefined,
      },
      {
        type: 'dropoff',
        address: dropoffAddress,
        riderId: (rider as any)._id.toString(),
        riderName: `${(rider as any).firstName} ${(rider as any).lastName}`,
        lat: dropoffGeo?.lat,
        lng: dropoffGeo?.lng,
        stopOrder: 1,
        status: 'pending',
        appointmentTime: appointmentTime ? new Date(appointmentTime) : undefined,
      },
    ];

    if (isRoundTrip) {
      stops.push({
        type: 'pickup',
        address: dropoffAddress,
        riderId: (rider as any)._id.toString(),
        riderName: `${(rider as any).firstName} ${(rider as any).lastName}`,
        lat: dropoffGeo?.lat,
        lng: dropoffGeo?.lng,
        stopOrder: 2,
        status: 'pending',
      });
      stops.push({
        type: 'dropoff',
        address: pickupAddress,
        riderId: (rider as any)._id.toString(),
        riderName: `${(rider as any).firstName} ${(rider as any).lastName}`,
        lat: pickupGeo?.lat,
        lng: pickupGeo?.lng,
        stopOrder: 3,
        status: 'pending',
      });
    }

    const trip = new Trip({
      organization: org._id,
      tripDate: new Date(tripDate),
      stops,
      notes: notes ? `[RIDER REQUEST] ${notes}` : '[RIDER REQUEST]',
      status: 'scheduled',
      payment: { type: 'none' },
      createdBy: null,
    });

    await trip.save();
    res.status(201).json({ success: true, tripNumber: (trip as any).tripNumber, message: 'Trip request submitted. Your dispatcher will confirm shortly.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
