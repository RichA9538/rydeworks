import mongoose from 'mongoose';

const organizationSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  slug:        { type: String, required: true, unique: true, lowercase: true },
  description: { type: String },
  email:       { type: String, trim: true },
  phone:       { type: String, trim: true },
  address:     { street: String, city: String, state: String, zip: String },
  logo:         { type: String },
  primaryColor: { type: String, default: '#00D4C8' },
  accentColor:  { type: String, default: '#0A1628' },
  appName:      { type: String, default: 'RydeWorks' },
  homeBases: [{
    name:      { type: String, required: true },
    address:   { type: String },
    lat:       { type: Number },
    lng:       { type: Number },
    isDefault: { type: Boolean, default: false }
  }],
  fareZones: [{
    name:          { type: String },
    description:   { type: String },
    minMiles:      { type: Number, default: 0 },
    maxMiles:      { type: Number },
    roundTripFare: { type: Number },
    oneWayFare:    { type: Number },
    notes:         { type: String }
  }],
  partnerRates: [{
    name:      { type: String },
    blockHours:{ type: Number },
    zoneLabel: { type: String },
    price:     { type: Number },
    priceMax:  { type: Number },
    notes:     { type: String }
  }],
  selfPayConfig: {
    squareApplicationId: { type: String },
    squareLocationId:    { type: String },
    paymentLink:         { type: String },
    venmoHandle:         { type: String },
    cashAppHandle:       { type: String }
  },
  plan: {
    type: String,
    enum: ['trial', 'basic', 'professional', 'enterprise'],
    default: 'trial'
  },
  planExpiresAt: { type: Date },
  settings: {
    timezone:         { type: String, default: 'America/New_York' },
    currency:         { type: String, default: 'USD' },
    smsNotifications: { type: Boolean, default: false },
    twilioPhone:      { type: String },
    status:           { type: String, default: 'active' }
  },
  paymentProvider: {
    type: String,
    enum: ['stripe', 'square', 'ach', 'multiple'],
    default: 'stripe'
  },
  riderSequence: { type: Number, default: 0 },
  reportingPrefix: { type: String, default: 'RWK' },
  isActive:  { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

organizationSchema.pre('save', function () {
  this.updatedAt = new Date();

});

export const Organization = mongoose.models.Organization || mongoose.model('Organization', organizationSchema);
