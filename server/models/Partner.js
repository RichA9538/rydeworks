const mongoose = require('mongoose');

const partnerSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },

  name:        { type: String, required: true, trim: true }, // "Pinellas County Housing Authority"
  contactName: { type: String, trim: true },
  contactEmail:{ type: String, trim: true, lowercase: true },
  contactPhone:{ type: String, trim: true },
  address:     { type: String },

  // Billing
  billingRate:  { type: Number },  // per-trip rate if different from standard
  billingNotes: { type: String },
  invoiceCycle: {
    type: String,
    enum: ['per_trip', 'weekly', 'monthly'],
    default: 'monthly'
  },

  // Stats
  totalTrips: { type: Number, default: 0 },
  totalBilled:{ type: Number, default: 0 },

  isActive:  { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

partnerSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Partner', partnerSchema);
