import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const stopSchema = new mongoose.Schema({
  stopOrder:       { type: Number, required: true },
  type:            { type: String, enum: ['pickup', 'dropoff'], required: true },
  riderId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Rider' },
  riderName:       { type: String },
  riderPhone:      { type: String },
  address:         { type: String, required: true },
  lat:             { type: Number },
  lng:             { type: Number },
  scheduledTime:   { type: Date },
  appointmentTime: { type: Date },
  actualArrival:   { type: Date },
  actualDeparture: { type: Date },
  status: {
    type: String,
    enum: ['pending', 'en_route', 'arrived', 'aboard', 'completed', 'no_show', 'canceled'],
    default: 'pending'
  },
  notes: { type: String }
}, { _id: true });

const tripSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  tripNumber:   { type: String, unique: true },
  driver:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  vehicle:      { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  homeBase: {
    name:    { type: String },
    address: { type: String },
    lat:     { type: Number },
    lng:     { type: Number }
  },
  tripDate: { type: Date, required: true },
  stops:    [stopSchema],
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'completed', 'canceled'],
    default: 'scheduled'
  },
  optimizedRoute: {
    totalDistanceMiles: Number,
    totalDurationMins:  Number,
    polyline:           String,
    waypoints:          [{ lat: Number, lng: Number }]
  },
  payment: {
    type: {
      type: String,
      enum: ['grant', 'self_pay', 'partner', 'free_ride', 'none'],
      default: 'none'
    },
    grantId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Grant' },
    grantName:       { type: String },
    partnerId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Partner' },
    partnerName:     { type: String },
    accessCodeId:    { type: mongoose.Schema.Types.ObjectId, ref: 'AccessCode' },
    freeRideCode:    { type: String },
    estimatedFare:   { type: Number, default: 0 },
    actualFare:      { type: Number, default: 0 },
    isPaid:          { type: Boolean, default: false },
    paidAt:          { type: Date },
    stripePaymentId: { type: String }
  },
  driverLog: {
    startMileage:    { type: Number },
    endMileage:      { type: Number },
    inspectionDone:  { type: Boolean, default: false },
    inspectionNotes: { type: String },
    startTime:       { type: Date },
    endTime:         { type: Date }
  },
  notes:     { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

tripSchema.pre('save', async function () {
  this.updatedAt = new Date();
  if (this.isNew && !(this as any).tripNumber) {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = uuidv4().substring(0, 4).toUpperCase();
    (this as any).tripNumber = `RWK-${dateStr}-${rand}`;
  }

});

tripSchema.index({ organization: 1, tripDate: -1 });
tripSchema.index({ driver: 1, tripDate: 1 });
tripSchema.index({ status: 1 });

export const Trip = mongoose.models.Trip || mongoose.model('Trip', tripSchema);
