const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const accessCodeSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },

  code: { type: String, required: true, unique: true, uppercase: true },

  type: {
    type: String,
    enum: ['registration', 'free_ride'],
    required: true
  },

  status: {
    type: String,
    enum: ['available', 'used', 'expired', 'revoked'],
    default: 'available'
  },

  // For registration codes
  usedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  usedAt: { type: Date },

  // For free ride coupons
  freeRide: {
    assignedTo:  { type: mongoose.Schema.Types.ObjectId, ref: 'Rider' },
    expiresAt:   { type: Date },   // 30 days from issuance
    tripsAllowed: { type: Number, default: 1 },
    tripsUsed:   { type: Number, default: 0 },
    valueUsed:   { type: Number, default: 0 },  // for grant reporting
    tripHistory: [{
      tripId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Trip' },
      date:      { type: Date },
      fareValue: { type: Number }
    }]
  },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes:     { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

accessCodeSchema.index({ organization: 1, type: 1 });

// Generate code BEFORE validation so 'required' check passes
accessCodeSchema.pre('validate', function (next) {
  if (this.isNew && !this.code) {
    const prefix = this.type === 'registration' ? 'PERC' : 'FREE';
    const rand = uuidv4().substring(0, 6).toUpperCase();
    this.code = `${prefix}-${rand}`;
  }
  next();
});

accessCodeSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Check if free ride is still valid
accessCodeSchema.methods.isValidFreeRide = function () {
  if (this.type !== 'free_ride') return false;
  if (this.status !== 'available') return false;
  if (this.freeRide.expiresAt && new Date() > this.freeRide.expiresAt) {
    this.status = 'expired';
    return false;
  }
  return true;
};

// Static: generate a batch of codes
accessCodeSchema.statics.generateBatch = async function (orgId, type, quantity, createdBy, expiresInDays = 30) {
  const codes = [];
  for (let i = 0; i < quantity; i++) {
    const data = { organization: orgId, type, createdBy };
    if (type === 'free_ride') {
      const exp = new Date();
      exp.setDate(exp.getDate() + expiresInDays);
      data.freeRide = { expiresAt: exp };
    }
    const c = new this(data);
    await c.save();
    codes.push(c);
  }
  return codes;
};

module.exports = mongoose.model('AccessCode', accessCodeSchema);
