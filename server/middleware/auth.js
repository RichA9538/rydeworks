const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verify JWT and attach user to request
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).populate('organization').populate('driverInfo.vehicleAssigned');
    if (!user) return res.status(401).json({ success: false, error: 'User not found.' });
    if (!user.isActive) return res.status(401).json({ success: false, error: 'Account is deactivated.' });

    req.user = user;
    req.organizationId = user.organization?._id || null;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError')  return res.status(401).json({ success: false, error: 'Invalid token.' });
    if (error.name === 'TokenExpiredError')  return res.status(401).json({ success: false, error: 'Token expired.' });
    console.error('Auth middleware error:', error);
    res.status(500).json({ success: false, error: 'Authentication error.' });
  }
};

// Require one or more roles (user must have at least one)
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated.' });
  const hasRole = roles.some(r => req.user.roles.includes(r) || req.user.roles.includes('super_admin'));
  if (!hasRole) return res.status(403).json({ success: false, error: 'Access denied. Insufficient permissions.' });
  next();
};

// Super admin only
const superAdminOnly = (req, res, next) => {
  if (!req.user || !req.user.roles.includes('super_admin')) {
    return res.status(403).json({ success: false, error: 'Super Admin access required.' });
  }
  next();
};

// Ensure user belongs to the same org (super_admin bypasses)
const sameOrganization = (req, res, next) => {
  if (req.user.roles.includes('super_admin')) return next();
  const targetOrgId = req.params.orgId || req.body.organization || req.query.organization;
  if (targetOrgId && targetOrgId.toString() !== req.organizationId?.toString()) {
    return res.status(403).json({ success: false, error: 'Cannot access other organizations.' });
  }
  next();
};

module.exports = { authenticate, requireRole, superAdminOnly, sameOrganization };
