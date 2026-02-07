const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
  businessId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  code: { type: String, required: true, unique: true, uppercase: true },
  email: { type: String, required: true },
  name: { type: String, required: true },
  commissionRate: { type: Number, required: true, default: 0.10 },
  stripeConnectId: { type: String },
  stats: {
    clicks: { type: Number, default: 0 },
    signups: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 }
  },
  earnings: {
    pending: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  referredUsers: [{
    date: Date,
    orderId: String,
    amount: Number,
    commission: Number,
    product: String,
    status: { type: String, enum: ['pending', 'approved', 'paid', 'rejected'], default: 'pending' }
  }],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

referralSchema.index({ businessId: 1, code: 1 });
referralSchema.index({ businessId: 1, userId: 1 });

referralSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Referral', referralSchema);
