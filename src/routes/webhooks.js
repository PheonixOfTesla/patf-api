const express = require('express');
const router = express.Router();
const Business = require('../models/Business');
const Referral = require('../models/Referral');
const Payout = require('../models/Payout');

// Stripe webhook endpoint
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const { stripe } = require('../services/stripe');
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'account.updated':
      await handleAccountUpdated(event.data.object);
      break;

    case 'transfer.created':
      console.log('Transfer created:', event.data.object.id);
      break;

    case 'transfer.failed':
      await handleTransferFailed(event.data.object);
      break;

    case 'payout.paid':
      console.log('Payout completed:', event.data.object.id);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

async function handleAccountUpdated(account) {
  try {
    const business = await Business.findOne({ stripeAccountId: account.id });
    if (business) {
      console.log(`Stripe account ${account.id} updated for business ${business.businessId}`);
    }
  } catch (error) {
    console.error('Handle account updated error:', error);
  }
}

async function handleTransferFailed(transfer) {
  try {
    const payout = await Payout.findOne({ stripeTransferId: transfer.id });
    if (payout) {
      payout.status = 'failed';
      payout.failureReason = transfer.failure_message || 'Transfer failed';
      await payout.save();

      const referral = await Referral.findById(payout.referralId);
      if (referral) {
        referral.earnings.pending += payout.amount;
        referral.earnings.paid -= payout.amount;
        await referral.save();
      }
    }
  } catch (error) {
    console.error('Handle transfer failed error:', error);
  }
}

module.exports = router;
