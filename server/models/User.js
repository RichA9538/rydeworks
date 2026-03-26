const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Basic Info
  firstName: { type: String, required: true, trim: true },
  lastName:  { type: String, required: true, trim: true },
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:     { type: String, trim: true },
  password:  { type: String, required: true, minlength: 8 },

  // Roles — array so one person can have multiple (e.g. admin + dispatcher + driver)
  // super_admin = Rich / Alvarez & Associates master account (cross-org)
  // admin       = Organization administrator
  // dispatcher  = Can schedule and manage trips
  // driver      = Can see and update their own assigned trips
  roles: {
    type: [String],
    enum: ['super_admin', 'admin', 'dispatcher', 'driver'],
    default: ['driver']
  },

  // Organization membership
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },

  // Driver-specific fields
  driverInfo: {
    licenseNumber:   { type: String },
    licenseExpiry:   { type: Date },
    vehicleAssigned: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
    isAvailable:     { type: Boolean, default: true },
    currentLocation: { lat: Number, lng: Number },
    totalTrips:      { type: Number, default: 0 },
    rating:          { type: Number, default: 5.0 }
  },

  // Account status
  isActive:           { type: Boolean, default: true },
  emailVerified:      { type: Boolean, default: false },
  mustChangePassword: { type: Boolean, default: false },
  isDemo:             { type: Boolean, default: false },

  // Password reset
  resetPasswordToken:   { type: String },
  resetPasswordExpires: { type: Date },

  // Timestamps
  lastLogin: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes
userSchema.index({ organization: 1 });

// Virtual: full name
userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// Helper: check if user has a specific role
userSchema.methods.hasRole = function (role) {
  return this.roles.includes(role) || this.roles.includes('super_admin');
};

// Helper: primary display role (highest privilege)
userSchema.virtual('primaryRole').get(function () {
  if (this.roles.includes('super_admin')) return 'super_admin';
  if (this.roles.includes('admin'))       return 'admin';
  if (this.roles.includes('dispatcher'))  return 'dispatcher';
  return 'driver';
});

// Pre-save: hash password if changed
userSchema.pre('save', async function (next) {
  this.updatedAt = Date.now();
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Safe object (no password)
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject({ virtuals: true });
  delete obj.password;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
