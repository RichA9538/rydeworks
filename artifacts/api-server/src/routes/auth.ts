import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

const signToken = (userId: any) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET || 'fallback-secret', {
    expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any
  });

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email and password are required.' });
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase() })
      .populate('organization')
      .populate('driverInfo.vehicleAssigned');
    if (!user) { res.status(401).json({ success: false, error: 'Invalid email or password.' }); return; }
    if (!user.isActive) { res.status(401).json({ success: false, error: 'Account is deactivated. Contact your administrator.' }); return; }

    const isMatch = await (user as any).comparePassword(password);
    if (!isMatch) { res.status(401).json({ success: false, error: 'Invalid email or password.' }); return; }

    (user as any).lastLogin = new Date();
    await user.save();

    const token = signToken(user._id);
    res.json({ success: true, token, user: (user as any).toSafeObject() });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Server error during login.' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('organization')
      .populate('driverInfo.vehicleAssigned');
    res.json({ success: true, user: (user as any).toSafeObject() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, (_req, res) => {
  res.json({ success: true, message: 'Logged out successfully.' });
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ success: false, error: 'Both passwords are required.' });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ success: false, error: 'New password must be at least 8 characters.' });
      return;
    }
    const user = await User.findById(req.user._id);
    const isMatch = await (user as any).comparePassword(currentPassword);
    if (!isMatch) { res.status(401).json({ success: false, error: 'Current password is incorrect.' }); return; }
    (user as any).password = newPassword;
    await user!.save();
    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Server error.' });
  }
});

export default router;
