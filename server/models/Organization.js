const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  slug:        { type: String, required: true, unique: true, lowercase: true },
  description: { type: String },

  // Contact
  email:   { type: String, trim: true },
  phone:   { type: String, trim: true },
  address: { street: String, city: String, state: String, zip: String },

  // Branding (customizable per SaaS customer)
  logo:         { type: String },
  primaryColor: { type: String, default: '#2E7D32' },
  accentColor:  { type: String, default: '#FFC107' },
  appName:      { type: String, default: 'Zak Transportation Initiative' },

  // Multiple home bases — admins can add/edit/remove
  // Fare zones are calculated from whichever base the van departs from
  homeBases: [{
    name:      { type: String, required: true },  // "PERC St. Pete", "PERC Clearwater"
    address:   { type: String },
    lat:       { type: Number },
    lng:       { type: Number },
    isDefault: { type: Boolean, default: false }
  }],

  // Individual ride fare zones (flat round-trip, distance-based from home base)
  // Admins can edit prices at any time
  fareZones: [{
    name:          { type: String },   // "Zone 1 - Local"
    description:   { type: String },   // "Core South/Central St. Pete"
    minMiles:      { type: Number, default: 0 },
    maxMiles:      { type: Number },   // null = no upper limit (out-of-county)
    roundTripFare: { type: Number },   // flat round-trip price
    oneWayFare:    { type: Number },   // one-way (roundTrip / 2 by default)
    notes:         { type: String }
  }],

  // Partner/van booking rates (block pricing)
  partnerRates: [{
    name:          { type: String },   // "Half-day Zone 1-2"
    blockHours:    { type: Number },   // 4 or 8
    zoneLabel:     { type: String },   // "Zone 1-2", "Zone 3", etc.
    price:         { type: Number },
    priceMax:      { type: Number },   // for ranges like $480-$560
    notes:         { type: String }
  }],

  // Self-pay QR / payment config
  selfPayConfig: {
    squareApplicationId: { type: String },
    squareLocationId:    { type: String },
    paymentLink:         { type: String },  // URL for QR code
    venmoHandle:         { type: String },
    cashAppHandle:       { type: String }
  },

  // SaaS subscription tier
  plan: {
    type: String,
    enum: ['trial', 'basic', 'professional', 'enterprise'],
    default: 'trial'
  },
  planExpiresAt: { type: Date },

  // Settings
  settings: {
    timezone:         { type: String, default: 'America/New_York' },
    currency:         { type: String, default: 'USD' },
    smsNotifications: { type: Boolean, default: false },
    twilioPhone:      { type: String }
  },

  // Payment processor preference per org
  paymentProvider: {
    type: String,
    enum: ['stripe', 'square', 'ach', 'multiple'],
    default: 'stripe'
  },
  // Auto-incrementing counter for sequential rider IDs (e.g. PER-0001)
  riderSequence: { type: Number, default: 0 },

  isActive:  { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

organizationSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Organization', organizationSchema);
