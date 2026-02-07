const express = require('express');
const router = express.Router();
const Business = require('../models/Business');
const { authenticateApiKey } = require('../middleware/auth');
const { generateApiKey, generateBusinessId } = require('../utils/codeGenerator');
// POST /api/v1/business/register - Register a new business
router.post('/register', async (req, res) => {
  try {
    const { name, email, webhookUrl, defaultCommissionRate, payoutSchedule } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, error: 'name and email are required' });
    }

    // Check if business already exists
    const existingBusiness = await Business.findOne({ email });
    if (existingBusiness) {
      return res.status(400).json({ success: false, error: 'Business with this email already exists' });
    }

    const businessId = generateBusinessId();
    const apiKey = generateApiKey();

    const business = new Business({
      businessId,
      name,
      email,
      apiKey,
      webhookUrl,
      defaultCommissionRate: defaultCommissionRate || 0.10,
      payoutSchedule: payoutSchedule || 'monthly'
    });

    await business.save();

    res.status(201).json({
      success: true,
      business: {
        businessId: business.businessId,
        name: business.name,
        email: business.email,
        apiKey: business.apiKey,
        defaultCommissionRate: business.defaultCommissionRate,
        payoutSchedule: business.payoutSchedule
      },
      integration: {
        scriptTag: `<script src="https://cdn.patf.io/v1/patf.js"></script>`,
        initCode: `PATF.init('${business.apiKey}');`
      }
    });
  } catch (error) {
    console.error('Business registration error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/business/profile - Get business profile
router.get('/profile', authenticateApiKey, async (req, res) => {
  try {
    const business = req.business;

    res.json({
      success: true,
      business: {
        businessId: business.businessId,
        name: business.name,
        email: business.email,
        defaultCommissionRate: business.defaultCommissionRate,
        payoutSchedule: business.payoutSchedule,
        settings: business.settings,
        stats: business.stats,
        plan: business.plan,
        stripeConnected: !!business.stripeAccountId
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/business/settings - Update business settings
router.put('/settings', authenticateApiKey, async (req, res) => {
  try {
    const { defaultCommissionRate, payoutSchedule, webhookUrl, settings } = req.body;
    const business = req.business;

    if (defaultCommissionRate !== undefined) {
      business.defaultCommissionRate = defaultCommissionRate;
    }
    if (payoutSchedule) {
      business.payoutSchedule = payoutSchedule;
    }
    if (webhookUrl !== undefined) {
      business.webhookUrl = webhookUrl;
    }
    if (settings) {
      business.settings = { ...business.settings, ...settings };
    }

    await business.save();

    res.json({
      success: true,
      business: {
        defaultCommissionRate: business.defaultCommissionRate,
        payoutSchedule: business.payoutSchedule,
        webhookUrl: business.webhookUrl,
        settings: business.settings
      }
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/business/connect-stripe - Setup Stripe Connect
router.post('/connect-stripe', authenticateApiKey, async (req, res) => {
  try {
    const { createConnectAccount, createAccountLink } = require('../services/stripe');
    const { returnUrl, refreshUrl } = req.body;
    const business = req.business;

    if (!returnUrl || !refreshUrl) {
      return res.status(400).json({ success: false, error: 'returnUrl and refreshUrl are required' });
    }

    let stripeAccount;

    if (business.stripeAccountId) {
      // Get existing account link
      const accountLink = await createAccountLink(business.stripeAccountId, refreshUrl, returnUrl);
      return res.json({
        success: true,
        onboardingUrl: accountLink.url,
        accountId: business.stripeAccountId
      });
    }

    // Create new Stripe Connect account
    stripeAccount = await createConnectAccount(business.email, business.name);
    business.stripeAccountId = stripeAccount.id;
    await business.save();

    const accountLink = await createAccountLink(stripeAccount.id, refreshUrl, returnUrl);

    res.json({
      success: true,
      onboardingUrl: accountLink.url,
      accountId: stripeAccount.id
    });
  } catch (error) {
    console.error('Stripe connect error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/business/regenerate-key - Regenerate API key
router.post('/regenerate-key', authenticateApiKey, async (req, res) => {
  try {
    const business = req.business;
    const newApiKey = generateApiKey();

    business.apiKey = newApiKey;
    await business.save();

    res.json({
      success: true,
      apiKey: newApiKey
    });
  } catch (error) {
    console.error('Regenerate key error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
