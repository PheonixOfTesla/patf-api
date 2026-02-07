const express = require('express');
const router = express.Router();
const Referral = require('../models/Referral');
const Business = require('../models/Business');
const Payout = require('../models/Payout');
const { authenticateApiKey } = require('../middleware/auth');
const { generateReferralCode } = require('../utils/codeGenerator');
const { createTransfer } = require('../services/stripe');

// POST /api/v1/referrals/create - Generate code for new user
router.post('/create', authenticateApiKey, async (req, res) => {
  try {
    const { userId, email, name, commissionRate } = req.body;
    const business = req.business;

    if (!userId || !email || !name) {
      return res.status(400).json({ success: false, error: 'userId, email, and name are required' });
    }

    // Check if user already has a referral code
    let referral = await Referral.findOne({ businessId: business.businessId, userId });

    if (referral) {
      return res.json({
        success: true,
        code: referral.code,
        trackingUrl: `${process.env.BASE_URL || 'https://patf.io'}?ref=${referral.code}`,
        shareLinks: generateShareLinks(referral.code, business.name),
        existing: true
      });
    }

    // Generate unique code
    let code = generateReferralCode(name, business.settings.codePrefix);
    let attempts = 0;
    while (await Referral.findOne({ code }) && attempts < 10) {
      code = generateReferralCode(name, business.settings.codePrefix);
      attempts++;
    }

    referral = new Referral({
      businessId: business.businessId,
      userId,
      code,
      email,
      name,
      commissionRate: commissionRate || business.defaultCommissionRate
    });

    await referral.save();

    // Update business stats
    await Business.updateOne(
      { businessId: business.businessId },
      { $inc: { 'stats.totalReferrals': 1 } }
    );

    res.json({
      success: true,
      code: referral.code,
      trackingUrl: `${process.env.BASE_URL || 'https://patf.io'}?ref=${referral.code}`,
      shareLinks: generateShareLinks(referral.code, business.name)
    });
  } catch (error) {
    console.error('Create referral error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/referrals/track - Track referral event
router.post('/track', authenticateApiKey, async (req, res) => {
  try {
    const { code, eventType, amount, orderId, metadata } = req.body;
    const business = req.business;

    if (!code || !eventType) {
      return res.status(400).json({ success: false, error: 'code and eventType are required' });
    }

    const referral = await Referral.findOne({ code: code.toUpperCase(), businessId: business.businessId });

    if (!referral) {
      return res.status(404).json({ success: false, error: 'Referral code not found' });
    }

    let commissionEarned = 0;

    // Update stats based on event type
    switch (eventType) {
      case 'click':
        referral.stats.clicks += 1;
        break;
      case 'signup':
        referral.stats.signups += 1;
        break;
      case 'purchase':
      case 'subscription':
        if (!amount) {
          return res.status(400).json({ success: false, error: 'amount is required for purchase/subscription events' });
        }
        referral.stats.conversions += 1;
        referral.stats.totalRevenue += amount;
        commissionEarned = amount * referral.commissionRate;
        referral.earnings.pending += commissionEarned;
        referral.earnings.total += commissionEarned;

        referral.referredUsers.push({
          date: new Date(),
          orderId: orderId || `order_${Date.now()}`,
          amount,
          commission: commissionEarned,
          product: metadata?.product || 'Unknown',
          status: 'pending'
        });

        // Update business stats
        await Business.updateOne(
          { businessId: business.businessId },
          { $inc: { 'stats.totalRevenue': amount } }
        );
        break;
      default:
        return res.status(400).json({ success: false, error: 'Invalid eventType' });
    }

    await referral.save();

    // Calculate next payout date
    const nextPayoutDate = getNextPayoutDate(business.payoutSchedule);

    res.json({
      success: true,
      commissionEarned,
      referrer: {
        name: referral.name,
        totalEarnings: referral.earnings.total,
        lifetimeReferrals: referral.stats.conversions
      },
      payoutScheduled: nextPayoutDate
    });
  } catch (error) {
    console.error('Track referral error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/referrals/:code/stats - Get earnings/stats
router.get('/:code/stats', authenticateApiKey, async (req, res) => {
  try {
    const { code } = req.params;
    const business = req.business;

    const referral = await Referral.findOne({ code: code.toUpperCase(), businessId: business.businessId });

    if (!referral) {
      return res.status(404).json({ success: false, error: 'Referral code not found' });
    }

    const conversionRate = referral.stats.clicks > 0
      ? ((referral.stats.conversions / referral.stats.clicks) * 100).toFixed(1)
      : 0;

    res.json({
      code: referral.code,
      clicks: referral.stats.clicks,
      signups: referral.stats.signups,
      conversions: referral.stats.conversions,
      conversionRate: parseFloat(conversionRate),
      earnings: {
        pending: referral.earnings.pending,
        paid: referral.earnings.paid,
        total: referral.earnings.total
      },
      topReferrals: referral.referredUsers
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10)
        .map(r => ({
          date: r.date,
          amount: r.amount,
          commission: r.commission,
          product: r.product
        }))
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/referrals/payout - Trigger payout
router.post('/payout', authenticateApiKey, async (req, res) => {
  try {
    const { code } = req.body;
    const business = req.business;

    const referral = await Referral.findOne({ code: code.toUpperCase(), businessId: business.businessId });

    if (!referral) {
      return res.status(404).json({ success: false, error: 'Referral code not found' });
    }

    if (referral.earnings.pending < business.settings.minPayoutAmount) {
      return res.status(400).json({
        success: false,
        error: `Minimum payout amount is $${business.settings.minPayoutAmount}`,
        pendingAmount: referral.earnings.pending
      });
    }

    if (!referral.stripeConnectId) {
      return res.status(400).json({
        success: false,
        error: 'Referrer has not connected their Stripe account'
      });
    }

    const payoutAmount = referral.earnings.pending;
    const platformFee = payoutAmount * 0.03; // 3% platform fee
    const netAmount = payoutAmount - platformFee;

    // Create payout record
    const payout = new Payout({
      businessId: business.businessId,
      referralCode: referral.code,
      referralId: referral._id,
      amount: payoutAmount,
      platformFee,
      netAmount,
      status: 'processing'
    });

    await payout.save();

    try {
      // Process Stripe transfer
      const transfer = await createTransfer(
        netAmount,
        referral.stripeConnectId,
        `payout_${payout._id}`
      );

      payout.stripeTransferId = transfer.id;
      payout.status = 'completed';
      payout.processedAt = new Date();
      await payout.save();

      // Update referral earnings
      referral.earnings.paid += payoutAmount;
      referral.earnings.pending = 0;

      // Mark referred users as paid
      referral.referredUsers.forEach(r => {
        if (r.status === 'approved') {
          r.status = 'paid';
        }
      });

      await referral.save();

      // Update business stats
      await Business.updateOne(
        { businessId: business.businessId },
        { $inc: { 'stats.totalCommissionsPaid': payoutAmount } }
      );

      res.json({
        success: true,
        payout: {
          id: payout._id,
          amount: payoutAmount,
          platformFee,
          netAmount,
          status: 'completed',
          stripeTransferId: transfer.id
        }
      });
    } catch (stripeError) {
      payout.status = 'failed';
      payout.failureReason = stripeError.message;
      await payout.save();

      res.status(500).json({ success: false, error: 'Payout processing failed', reason: stripeError.message });
    }
  } catch (error) {
    console.error('Payout error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper functions
function generateShareLinks(code, businessName) {
  const message = encodeURIComponent(`Check out ${businessName}! Use my code ${code} for a special offer.`);
  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?quote=${message}`,
    twitter: `https://twitter.com/intent/tweet?text=${message}`,
    email: `mailto:?subject=Check out ${encodeURIComponent(businessName)}&body=${message}`
  };
}

function getNextPayoutDate(schedule) {
  const now = new Date();
  let nextDate = new Date(now);

  switch (schedule) {
    case 'weekly':
      nextDate.setDate(now.getDate() + (7 - now.getDay()));
      break;
    case 'biweekly':
      nextDate.setDate(now.getDate() + 14);
      break;
    case 'monthly':
    default:
      nextDate.setMonth(now.getMonth() + 1, 1);
      break;
  }

  return nextDate.toISOString().split('T')[0];
}

module.exports = router;
