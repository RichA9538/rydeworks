const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.NOTIFY_EMAIL_USER,
    pass: process.env.NOTIFY_EMAIL_PASS
  }
});

// Generate JWT
const signToken = (userId) => jwt.sign(
  { id: userId },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
);

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).populate('organization').populate('driverInfo.vehicleAssigned');
    if (!user) return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    if (!user.isActive) return res.status(401).json({ success: false, error: 'Account is deactivated. Contact your administrator.' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ success: false, error: 'Invalid email or password.' });

    user.lastLogin = new Date();
    await user.save();

    const token = signToken(user._id);
    const safeUser = user.toSafeObject();
    res.json({
      success: true,
      token,
      user: safeUser,
      mustChangePassword: !!user.mustChangePassword
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Server error during login.' });
  }
});

// GET /api/auth/me — get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('organization')
      .populate('driverInfo.vehicleAssigned');
    res.json({ success: true, user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// POST /api/auth/set-first-password — used on first login when mustChangePassword is true
// No current-password required since this is a forced reset with a temp password
router.post('/set-first-password', authenticate, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters.' });
    }
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });
    user.password = newPassword;
    user.mustChangePassword = false;
    await user.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Both passwords are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'New password must be at least 8 characters.' });
    }

    const user = await User.findById(req.user._id);
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return res.status(401).json({ success: false, error: 'Current password is incorrect.' });

    user.password = newPassword;
    user.mustChangePassword = false;
    await user.save();
    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// POST /api/auth/logout (client just drops the token, but we log it)
router.post('/logout', authenticate, async (req, res) => {
  res.json({ success: true, message: 'Logged out successfully.' });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email is required.' });
    const user = await User.findOne({ email: email.toLowerCase() });
    // Always respond success to prevent email enumeration
    if (!user) return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });

    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    const origin = req.headers.origin || `https://app.rydeworks.com`;
    const resetUrl = `${origin}/reset-password.html?token=${token}`;

    if (process.env.NOTIFY_EMAIL_USER && process.env.NOTIFY_EMAIL_PASS) {
      await emailTransporter.sendMail({
        from: `"Rydeworks" <${process.env.NOTIFY_EMAIL_USER}>`,
        to: user.email,
        subject: 'Rydeworks — Password Reset',
        html: `<p>Hello ${user.firstName || ''},</p><p>Click the link below to reset your password. This link expires in 1 hour.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, ignore this email.</p>`
      });
    } else if (process.env.TWILIO_ACCOUNT_SID && user.phone) {
      // SMS fallback if email not configured
      const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await twilio.messages.create({
        from: process.env.TWILIO_PHONE_NUMBER,
        to: user.phone,
        body: `Rydeworks password reset: ${resetUrl} (expires in 1 hour)`
      });
    }

    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ success: false, error: 'Token and password are required.' });
    if (password.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters.' });

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() }
    });
    if (!user) return res.status(400).json({ success: false, error: 'Reset link is invalid or has expired.' });

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, error: 'Server error.' });
  }
});

module.exports = router;
