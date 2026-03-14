const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },

  name:         { type: String, required: true }, // "Van 1", "Van 2", etc.
  make:         { type: String },
  model:        { type: String },
  year:         { type: Number },
  licensePlate: { type: String, uppercase: true },
  color:        { type: String },
  capacity:     { type: Number, default: 7 },

  status: {
    type: String,
    enum: ['available', 'in_use', 'maintenance', 'inactive'],
    default: 'available'
  },

  currentDriver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  lastMaintenanceDate: { type: Date },
  nextMaintenanceDate: { type: Date },
  mileage:             { type: Number, default: 0 },

  notes:     { type: String },
  isActive:  { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

vehicleSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Vehicle', vehicleSchema);
