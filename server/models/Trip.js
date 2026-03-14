const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// Individual stop within a trip (one rider = one stop pair: pickup + dropoff)
const stopSchema = new mongoose.Schema({
  stopOrder:   { type: Number, required: true },
  type:        { type: String, enum: ['pickup', 'dropoff'], required: true },

  // Rider info
  riderId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Rider' },
  riderName:   { type: String },   // display name
  riderPhone:  { type: String },

  // Location
  address:     { type: String, required: true },
  lat:         { type: Number },
  lng:         { type: Number },

  // Timing
  scheduledTime:  { type: Date },   // when driver should arrive
  appointmentTime:{ type: Date },   // when rider needs to be at destination
  actualArrival:  { type: Date },
  actualDeparture:{ type: Date },

  // Status
  // pending → en_route → arrived → aboard → completed / no_show / canceled
  status: {
    type: String,
    enum: ['pending', 'en_route', 'arrived', 'aboard', 'completed', 'no_show', 'canceled'],
    default: 'pending'
  },

  notes: { type: String }
}, { _id: true });

const tripSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },

  // Trip identifier
  tripNumber: { type: String, unique: true },

  // Assignment
  driver:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },

  // Home base for this trip (radius calc origin)
  homeBase: {
    name:    { type: String },  // "PERC St. Pete", "PERC Clearwater"
    address: { type: String },
    lat:     { type: Number },
    lng:     { type: Number }
  },

  // Scheduled date
  tripDate: { type: Date, required: true },

  // All stops in order
  stops: [stopSchema],

  // Overall trip status
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'completed', 'canceled'],
    default: 'scheduled'
  },

  // Route info (from Google Maps optimization)
  optimizedRoute: {
    totalDistanceMiles: Number,
    totalDurationMins:  Number,
    polyline:           String,  // encoded polyline for map display
    waypoints:          [{ lat: Number, lng: Number }]
  },

  // Payment
  payment: {
    type: {
      type: String,
      enum: ['grant', 'self_pay', 'partner', 'free_ride', 'none'],
      default: 'none'
    },
    grantId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Grant' },
    grantName:     { type: String },
    partnerId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Partner' },
    partnerName:   { type: String },
    accessCodeId:  { type: mongoose.Schema.Types.ObjectId, ref: 'AccessCode' },
    freeRideCode:  { type: String },

    estimatedFare: { type: Number, default: 0 },
    actualFare:    { type: Number, default: 0 },
    isPaid:        { type: Boolean, default: false },
    paidAt:        { type: Date },
    squarePaymentId: { type: String }
  },

  // Driver log
  driverLog: {
    startMileage:   { type: Number },
    endMileage:     { type: Number },
    inspectionDone: { type: Boolean, default: false },
    inspectionNotes:{ type: String },
    startTime:      { type: Date },
    endTime:        { type: Date }
  },

  // Dispatcher notes
  notes: { type: String },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Auto-generate trip number
tripSchema.pre('save', async function (next) {
  this.updatedAt = Date.now();
  if (this.isNew && !this.tripNumber) {
    const date = new Date();
    const dateStr = date.toISOString().slice(0,10).replace(/-/g,'');
    const rand = uuidv4().substring(0,4).toUpperCase();
    this.tripNumber = `RWK-${dateStr}-${rand}`;
  }
  next();
});

tripSchema.index({ organization: 1, tripDate: -1 });
tripSchema.index({ driver: 1, tripDate: 1 });
tripSchema.index({ status: 1 });

module.exports = mongoose.model('Trip', tripSchema);
