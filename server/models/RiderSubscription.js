const mongoose = require('mongoose');

const riderSubscriptionSchema = new mongoose.Schema({
  rider: { type: mongoose.Schema.Types.ObjectId, ref: 'Rider' },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
  firstName:   { type: String, required: true, trim: true },
  lastName:    { type: String, required: true, trim: true },
  phone:       { type: String, required: true, trim: true },
  email:       { type: String, trim: true, lowercase: true },
  homeAddress: { type: String },

  // Payment method type
  paymentMethodType: {
    type: String,
    enum: ['card', 'ach', 'venmo', 'cashapp', 'payroll_deduction', 'phone'],
    default: 'card'
  },

  // Stripe (for card/ACH)
  stripeCustomerId:      { type: String },
  stripePaymentMethodId: { type: String },

  // Venmo/Cash App handles (rider's own handle for sending payment)
  venmoHandle:   { type: String },
  cashAppHandle: { type: String },

  // Payroll deduction
  employer: {
    name:            { type: String },
    contactName:     { type: String },
    contactEmail:    { type: String },
    deductionSchedule: { type: String, enum: ['weekly', 'biweekly', 'monthly'], default: 'weekly' }
  },

  // Credit balance
  creditBalance: { type: Number, default: 0 },

  // Free ride code
  freeRideCode:  { type: String },
  codeExpiresAt: { type: Date },
  freeRideUsed:  { type: Boolean, default: false },

  // Weekly billing
  weeklyBillingEnabled: { type: Boolean, default: true },
  lastBilledAt:         { type: Date },
  weeklyEstimatedFare:  { type: Number, default: 0 }, // estimated weekly cost based on schedule

  // Minimum commitment (1-week worth of rides, charged if canceled within 30 days)
  minimumCommitmentAmount: { type: Number, default: 0 },
  minimumCommitmentPaid:   { type: Boolean, default: false },

  // Cancellation
  status: { type: String, enum: ['active', 'cancelled', 'suspended', 'pending'], default: 'active' },
  canceledAt:       { type: Date },
  canceledBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancellationNote: { type: String },
  cancelChargeApplied: { type: Boolean, default: false },

  // Payment history
  payments: [{
    amount:    { type: Number },
    method:    { type: String },
    stripePaymentIntentId: { type: String },
    type:      { type: String, enum: ['initial', 'replenishment', 'weekly', 'cancellation_fee', 'manual'] },
    note:      { type: String },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
  }],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

riderSubscriptionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

riderSubscriptionSchema.index({ phone: 1 });
riderSubscriptionSchema.index({ stripeCustomerId: 1 });
riderSubscriptionSchema.index({ organization: 1 });

module.exports = mongoose.model('RiderSubscription', riderSubscriptionSchema);
