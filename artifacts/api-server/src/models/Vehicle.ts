import mongoose from 'mongoose';

const vehicleSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  name:         { type: String, required: true },
  make:         { type: String },
  model:        { type: String },
  year:         { type: Number },
  vin:          { type: String, uppercase: true, trim: true },
  licensePlate: { type: String, uppercase: true },
  color:        { type: String },
  capacity:     { type: Number, default: 7 },
  baseLocation: {
    name:    { type: String },
    address: { type: String },
    lat:     { type: Number },
    lng:     { type: Number }
  },
  status: {
    type: String,
    enum: ['available', 'in_use', 'maintenance', 'out_of_service'],
    default: 'available'
  },
  currentDriver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  currentLocation: { lat: Number, lng: Number },
  isActive:  { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

vehicleSchema.pre('save', function () {
  this.updatedAt = new Date();

});

export const Vehicle = mongoose.models.Vehicle || mongoose.model('Vehicle', vehicleSchema);
