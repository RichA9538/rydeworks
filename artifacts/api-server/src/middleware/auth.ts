import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

export interface AuthRequest extends Request {
  user?: any;
  organizationId?: any;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Access denied. No token provided.' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as any;

    const user = await User.findById(decoded.id).populate('organization').populate('driverInfo.vehicleAssigned');
    if (!user) { res.status(401).json({ success: false, error: 'User not found.' }); return; }
    if (!user.isActive) { res.status(401).json({ success: false, error: 'Account is deactivated.' }); return; }

    req.user = user;
    req.organizationId = (user as any).organization?._id || null;
    next();
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError') { res.status(401).json({ success: false, error: 'Invalid token.' }); return; }
    if (error.name === 'TokenExpiredError') { res.status(401).json({ success: false, error: 'Token expired.' }); return; }
    res.status(500).json({ success: false, error: 'Authentication error.' });
  }
};

export const requireRole = (...roles: string[]) => (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated.' }); return; }
  const hasRole = roles.some(r => req.user.roles.includes(r) || req.user.roles.includes('super_admin'));
  if (!hasRole) { res.status(403).json({ success: false, error: 'Access denied. Insufficient permissions.' }); return; }
  next();
};

export const superAdminOnly = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user || !req.user.roles.includes('super_admin')) {
    res.status(403).json({ success: false, error: 'Super Admin access required.' });
    return;
  }
  next();
};
