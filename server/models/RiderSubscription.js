const mongoose = require('mongoose');

const riderSubscriptionSchema = new mongoose.Schema({
  // Link to rider record (created or found by phone)
  rider: { type: mongoose.Schema.Types.ObjectId, ref: 'Rider' },
  // Contact info (stored here too for guest bookings before rider record is created)
  firstName:   { type: String, required: true, trim: true },
  lastName:    { type: String, required: true, trim: true },
  phone:       { type: String, required: true, trim: true },
  email:       { type: String, trim: true, lowercase: true },
  homeAddress: { type: String },
  // Stripe
  stripeCustomerId:      { type: String },
  stripePaymentMethodId: { type: String },
  // Credit balance (in dollars)
  creditBalance:    { type: Number, default: 100.00 },
  initialBalanceUsed: { type: Boolean, default: false }, // true once first $100 is fully used
  // Free ride code
  freeRideCode:   { type: String },
  codeExpiresAt:  { type: Date },
  // Subscription status
  status: { type: String, enum: ['active', 'cancelled', 'suspended'], default: 'active' },
  cancelRequestedAt: { type: Date },
  // Payment history
  payments: [{
    amount:    { type: Number },
    stripePaymentIntentId: { type: String },
    type:      { type: String, enum: ['initial', 'replenishment'] },
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

module.exports = mongoose.model('RiderSubscription', riderSubscriptionSchema);
