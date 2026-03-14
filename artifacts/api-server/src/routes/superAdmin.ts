import { Router } from 'express';
import { Organization } from '../models/Organization.js';
import { User } from '../models/User.js';
import { authenticate, superAdminOnly, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authenticate as any, superAdminOnly as any);

// GET /api/super-admin/organizations
router.get('/organizations', async (_req, res) => {
  try {
    const organizations = await Organization.find().sort({ name: 1 });
    res.json({ success: true, organizations });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/super-admin/organizations
router.post('/organizations', async (req, res) => {
  try {
    const { name, slug, email, phone, appName, primaryColor, accentColor,
            adminEmail, adminPassword, adminFirstName, adminLastName } = req.body;

    if (!name || !slug || !adminEmail || !adminPassword || !adminFirstName || !adminLastName) {
      res.status(400).json({ success: false, error: 'Name, slug, and admin user info are required.' });
      return;
    }

    const existing = await Organization.findOne({ slug: slug.toLowerCase() });
    if (existing) { res.status(400).json({ success: false, error: 'Slug already in use.' }); return; }

    const org: any = new Organization({
      name, slug: slug.toLowerCase(), email, phone, appName: appName || name,
      primaryColor: primaryColor || '#00D4C8',
      accentColor:  accentColor  || '#0A1628'
    });
    await org.save();

    // Create admin user for this org
    const adminUser: any = new User({
      firstName: adminFirstName,
      lastName:  adminLastName,
      email:     adminEmail.toLowerCase(),
      password:  adminPassword,
      roles:     ['admin', 'dispatcher'],
      organization: org._id,
      isActive:  true,
      emailVerified: true
    });
    await adminUser.save();

    res.status(201).json({ success: true, org });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/super-admin/organizations/:id
router.patch('/organizations/:id', async (req, res) => {
  try {
    const org = await Organization.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!org) { res.status(404).json({ success: false, error: 'Organization not found.' }); return; }
    res.json({ success: true, org });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/super-admin/organizations/:id/suspend
router.post('/organizations/:id/suspend', async (req, res) => {
  try {
    const { reason } = req.body;
    const org = await Organization.findByIdAndUpdate(
      req.params.id,
      { 'settings.status': 'suspended', 'settings.suspendReason': reason || 'Nonpayment' },
      { new: true }
    );
    if (!org) { res.status(404).json({ success: false, error: 'Organization not found.' }); return; }
    await User.updateMany({ organization: req.params.id }, { isActive: false });
    res.json({ success: true, message: `${(org as any).name} suspended.`, org });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/super-admin/users
router.get('/users', async (_req, res) => {
  try {
    const users = await User.find().populate('organization', 'name slug').sort({ lastName: 1 });
    res.json({ success: true, users: users.map(u => (u as any).toSafeObject()) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
