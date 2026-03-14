import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName:  { type: String, required: true, trim: true },
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:     { type: String, trim: true },
  password:  { type: String, required: true, minlength: 8 },
  roles: {
    type: [String],
    enum: ['super_admin', 'admin', 'dispatcher', 'driver'],
    default: ['driver']
  },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
  driverInfo: {
    licenseNumber:   { type: String },
    licenseExpiry:   { type: Date },
    vehicleAssigned: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
    isAvailable:     { type: Boolean, default: true },
    currentLocation: { lat: Number, lng: Number },
    totalTrips:      { type: Number, default: 0 },
    rating:          { type: Number, default: 5.0 }
  },
  isActive:      { type: Boolean, default: true },
  emailVerified: { type: Boolean, default: false },
  resetPasswordToken:   { type: String },
  resetPasswordExpires: { type: Date },
  lastLogin: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

userSchema.index({ organization: 1 });

userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

userSchema.methods.hasRole = function (role: string) {
  return this.roles.includes(role) || this.roles.includes('super_admin');
};

userSchema.pre('save', async function () {
  (this as any).updatedAt = new Date();
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(12);
  (this as any).password = await bcrypt.hash((this as any).password, salt);
});

userSchema.methods.comparePassword = async function (candidate: string) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject({ virtuals: true });
  delete obj.password;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  return obj;
};

export const User = mongoose.models.User || mongoose.model('User', userSchema);
