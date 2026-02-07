const mongoose = require('mongoose');

const businessSchema = new mongoose.Schema({
  businessId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  apiKey: { type: String, required: true, unique: true },
  stripeAccountId: { type: String },
  defaultCommissionRate: { type: Number, default: 0.10 },
  payoutSchedule: { type: String, enum: ['weekly', 'biweekly', 'monthly'], default: 'monthly' },
  webhookUrl: { type: String },
  settings: {
    codePrefix: { type: String, default: '' },
    minPayoutAmount: { type: Number, default: 25 },
    payoutHoldDays: { type: Number, default: 30 }
  },
  stats: {
    totalReferrals: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    totalCommissionsPaid: { type: Number, default: 0 }
  },
  plan: { type: String, enum: ['starter', 'growth', 'scale'], default: 'starter' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

businessSchema.pre('save', function() {
  this.updatedAt = Date.now();
});

module.exports = mongoose.model('Business', businessSchema);
