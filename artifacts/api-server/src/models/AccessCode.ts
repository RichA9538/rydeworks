import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const accessCodeSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  code:    { type: String, unique: true },
  type:    { type: String, enum: ['registration', 'free_ride', 'discount'], default: 'free_ride' },
  status:  { type: String, enum: ['available', 'used', 'expired', 'revoked'], default: 'available' },
  rider:   { type: mongoose.Schema.Types.ObjectId, ref: 'Rider' },
  freeRide: {
    expiresAt:    { type: Date },
    ridesAllowed: { type: Number, default: 1 },
    ridesUsed:    { type: Number, default: 0 }
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  usedAt:    { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

accessCodeSchema.index({ organization: 1, type: 1 });

accessCodeSchema.pre('validate', function () {
  if (this.isNew && !(this as any).code) {
    const prefix = (this as any).type === 'registration' ? 'REG' : 'FREE';
    const rand = uuidv4().substring(0, 6).toUpperCase();
    (this as any).code = `${prefix}-${rand}`;
  }

});

accessCodeSchema.pre('save', function () {
  this.updatedAt = new Date();

});

accessCodeSchema.methods.isValidFreeRide = function () {
  if (this.type !== 'free_ride') return false;
  if (this.status !== 'available') return false;
  if (this.freeRide?.expiresAt && new Date() > this.freeRide.expiresAt) {
    this.status = 'expired';
    return false;
  }
  return true;
};

export const AccessCode = mongoose.models.AccessCode || mongoose.model('AccessCode', accessCodeSchema);
