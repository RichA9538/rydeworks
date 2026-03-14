const mongoose = require('mongoose');

const grantSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },

  name:        { type: String, required: true, trim: true }, // "FDOT Transportation Grant"
  grantor:     { type: String, trim: true },                 // "Florida DOT"
  description: { type: String },

  // Budget tracking
  totalAmount:   { type: Number, default: 0 },
  usedAmount:    { type: Number, default: 0 },
  remainingAmount:{ type: Number, default: 0 },

  // Date range
  startDate: { type: Date },
  endDate:   { type: Date },

  // Reporting requirements
  reportingNotes: { type: String },

  isActive:  { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

grantSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  this.remainingAmount = this.totalAmount - this.usedAmount;
  next();
});

module.exports = mongoose.model('Grant', grantSchema);
