const mongoose = require('mongoose');
// Riders are clients/passengers — separate from User accounts
// riderId is the human-readable unique ID shown in the UI (e.g. RWK-0001)
// anonymousId is kept for backward-compat with grant reports
const riderSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },

  // Human-readable unique ID: reporting prefix + zero-padded sequence
  // e.g. RWK-0001, PER-0003
  riderId: { type: String, unique: true, sparse: true },

  // Legacy anonymous identifier for grant reporting (kept for existing records, no longer set on new riders)
  anonymousId: { type: String, sparse: true },

  // Real info (kept private, not in reports)
  firstName: { type: String, required: true, trim: true },
  lastName:  { type: String, required: true, trim: true },
  phone:     { type: String, trim: true },
  email:     { type: String, trim: true, lowercase: true },

  // Home address — stored as plain string for display, with optional lat/lng for fare calc
  homeAddress: { type: String },
  homeAddressLat: { type: Number },
  homeAddressLng: { type: Number },
  commonDestinations: [{
    label:   String,  // "Work", "Doctor", etc.
    address: String,
    lat:     Number,
    lng:     Number
  }],

  // Notes for drivers (accessibility, preferences)
  notes: { type: String },

  // Free ride coupon
  freeRideCode: { type: mongoose.Schema.Types.ObjectId, ref: 'AccessCode' },

  // Stats
  totalTrips:    { type: Number, default: 0 },
  totalFarePaid: { type: Number, default: 0 },

  isActive:  { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

riderSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

riderSchema.index({ organization: 1 });
riderSchema.index({ phone: 1 });

module.exports = mongoose.model('Rider', riderSchema);
