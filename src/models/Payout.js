const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema({
  businessId: { type: String, required: true, index: true },
  referralCode: { type: String, required: true },
  referralId: { type: mongoose.Schema.Types.ObjectId, ref: 'Referral', required: true },
  amount: { type: Number, required: true },
  platformFee: { type: Number, required: true },
  netAmount: { type: Number, required: true },
  stripeTransferId: { type: String },
  status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
  failureReason: { type: String },
  processedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

payoutSchema.index({ businessId: 1, status: 1 });
payoutSchema.index({ referralId: 1 });

module.exports = mongoose.model('Payout', payoutSchema);
