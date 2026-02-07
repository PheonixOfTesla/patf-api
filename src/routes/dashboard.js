const Referral = require('../models/Referral');
const Payout = require('../models/Payout');
const { authenticateApiKey } = require('../middleware/auth');

// GET /api/v1/dashboard - Business analytics
module.exports = [authenticateApiKey, async (req, res) => {
  try {
    const business = req.business;
    const { startDate, endDate } = req.query;

    // Build date filter
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    // Get all referrals for this business
    const referrals = await Referral.find({ businessId: business.businessId });

    // Calculate totals
    const totals = referrals.reduce((acc, ref) => {
      acc.clicks += ref.stats.clicks;
      acc.signups += ref.stats.signups;
      acc.conversions += ref.stats.conversions;
      acc.revenue += ref.stats.totalRevenue;
      acc.commissionsPending += ref.earnings.pending;
      acc.commissionsPaid += ref.earnings.paid;
      return acc;
    }, {
      clicks: 0,
      signups: 0,
      conversions: 0,
      revenue: 0,
      commissionsPending: 0,
      commissionsPaid: 0
    });

    // Get top referrers
    const topReferrers = referrals
      .sort((a, b) => b.earnings.total - a.earnings.total)
      .slice(0, 10)
      .map(ref => ({
        code: ref.code,
        name: ref.name,
        conversions: ref.stats.conversions,
        revenue: ref.stats.totalRevenue,
        earnings: ref.earnings.total
      }));

    // Get recent conversions
    const recentConversions = referrals
      .flatMap(ref => ref.referredUsers.map(u => ({
        ...u.toObject(),
        referrerCode: ref.code,
        referrerName: ref.name
      })))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 20);

    // Get recent payouts
    const recentPayouts = await Payout.find({ businessId: business.businessId })
      .sort({ createdAt: -1 })
      .limit(10);

    // Calculate conversion rate
    const conversionRate = totals.clicks > 0
      ? ((totals.conversions / totals.clicks) * 100).toFixed(2)
      : 0;

    // Calculate average order value
    const avgOrderValue = totals.conversions > 0
      ? (totals.revenue / totals.conversions).toFixed(2)
      : 0;

    res.json({
      success: true,
      businessId: business.businessId,
      businessName: business.name,
      summary: {
        totalReferrers: referrals.length,
        activeReferrers: referrals.filter(r => r.stats.conversions > 0).length,
        totalClicks: totals.clicks,
        totalSignups: totals.signups,
        totalConversions: totals.conversions,
        conversionRate: parseFloat(conversionRate),
        totalRevenue: totals.revenue,
        avgOrderValue: parseFloat(avgOrderValue),
        commissionsPending: totals.commissionsPending,
        commissionsPaid: totals.commissionsPaid,
        totalCommissions: totals.commissionsPending + totals.commissionsPaid
      },
      topReferrers,
      recentConversions,
      recentPayouts: recentPayouts.map(p => ({
        id: p._id,
        referralCode: p.referralCode,
        amount: p.amount,
        platformFee: p.platformFee,
        netAmount: p.netAmount,
        status: p.status,
        createdAt: p.createdAt,
        processedAt: p.processedAt
      }))
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}];
