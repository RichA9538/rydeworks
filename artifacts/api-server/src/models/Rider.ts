import mongoose from 'mongoose';

const riderSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  riderId:      { type: String, unique: true, sparse: true },
  anonymousId:  { type: String, sparse: true },
  firstName:    { type: String, required: true, trim: true },
  lastName:     { type: String, required: true, trim: true },
  phone:        { type: String, trim: true },
  email:        { type: String, trim: true, lowercase: true },
  homeAddress:  { type: String },
  homeAddressLat: { type: Number },
  homeAddressLng: { type: Number },
  commonDestinations: [{
    label:   String,
    address: String,
    lat:     Number,
    lng:     Number
  }],
  notes:         { type: String },
  freeRideCode:  { type: mongoose.Schema.Types.ObjectId, ref: 'AccessCode' },
  totalTrips:    { type: Number, default: 0 },
  totalFarePaid: { type: Number, default: 0 },
  isActive:  { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

riderSchema.pre('save', function () {
  this.updatedAt = new Date();

});

riderSchema.index({ organization: 1 });
riderSchema.index({ phone: 1 });

export const Rider = mongoose.models.Rider || mongoose.model('Rider', riderSchema);
