const express = require('express');
const router = express.Router();
const Organization = require('../models/Organization');
const User = require('../models/User');
const { authenticate, superAdminOnly } = require('../middleware/auth');

router.use(authenticate, superAdminOnly);

// GET /api/super-admin/orgs — list all organizations
router.get('/orgs', async (req, res) => {
  try {
    const orgs = await Organization.find().sort({ name: 1 });
    res.json({ success: true, orgs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/super-admin/orgs — create new organization (new SaaS customer)
router.post('/orgs', async (req, res) => {
  try {
    const org = new Organization(req.body);
    await org.save();
    res.status(201).json({ success: true, org });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/super-admin/orgs/:id
router.put('/orgs/:id', async (req, res) => {
  try {
    const org = await Organization.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!org) return res.status(404).json({ success: false, error: 'Organization not found.' });
    res.json({ success: true, org });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/super-admin/orgs/:id/suspend — suspend org for nonpayment
router.post('/orgs/:id/suspend', async (req, res) => {
  try {
    const { reason } = req.body;
    const org = await Organization.findByIdAndUpdate(
      req.params.id,
      { 'settings.status': 'suspended', 'settings.suspendedAt': new Date(), 'settings.suspendReason': reason || 'Nonpayment' },
      { new: true }
    );
    if (!org) return res.status(404).json({ success: false, error: 'Organization not found.' });
    // Deactivate all users in this org
    await User.updateMany({ organization: req.params.id }, { isActive: false });
    res.json({ success: true, message: `${org.name} suspended. All users deactivated.`, org });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/super-admin/orgs/:id/reactivate — restore suspended org
router.post('/orgs/:id/reactivate', async (req, res) => {
  try {
    const org = await Organization.findByIdAndUpdate(
      req.params.id,
      { 'settings.status': 'active', $unset: { 'settings.suspendedAt': '', 'settings.suspendReason': '' } },
      { new: true }
    );
    if (!org) return res.status(404).json({ success: false, error: 'Organization not found.' });
    // Reactivate all users in this org
    await User.updateMany({ organization: req.params.id }, { isActive: true });
    res.json({ success: true, message: `${org.name} reactivated. All users restored.`, org });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/super-admin/orgs/:id/terminate — permanently terminate org
router.delete('/orgs/:id/terminate', async (req, res) => {
  try {
    const org = await Organization.findById(req.params.id);
    if (!org) return res.status(404).json({ success: false, error: 'Organization not found.' });
    // Deactivate all users first
    await User.updateMany({ organization: req.params.id }, { isActive: false });
    // Mark org as terminated (soft delete — keeps data for records)
    await Organization.findByIdAndUpdate(req.params.id, {
      'settings.status': 'terminated',
      'settings.terminatedAt': new Date()
    });
    res.json({ success: true, message: `${org.name} has been terminated. All access revoked.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/super-admin/users — list all users across all orgs
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().populate('organization', 'name slug').sort({ lastName: 1 });
    res.json({ success: true, users: users.map(u => u.toSafeObject()) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/super-admin/users — create user in any org
router.post('/users', async (req, res) => {
  try {
    const user = new User({ ...req.body, emailVerified: true, isActive: true });
    await user.save();
    res.status(201).json({ success: true, user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
