const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const createConnectAccount = async (email, businessName) => {
  try {
    const account = await stripe.accounts.create({
      type: 'express',
      email: email,
      business_profile: {
        name: businessName
      },
      capabilities: {
        transfers: { requested: true }
      }
    });
    return account;
  } catch (error) {
    console.error('Stripe Connect account creation error:', error);
    throw error;
  }
};

const createAccountLink = async (accountId, refreshUrl, returnUrl) => {
  try {
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding'
    });
    return accountLink;
  } catch (error) {
    console.error('Stripe account link error:', error);
    throw error;
  }
};

const createTransfer = async (amount, destinationAccountId, transferGroup) => {
  try {
    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      destination: destinationAccountId,
      transfer_group: transferGroup
    });
    return transfer;
  } catch (error) {
    console.error('Stripe transfer error:', error);
    throw error;
  }
};

const getAccountStatus = async (accountId) => {
  try {
    const account = await stripe.accounts.retrieve(accountId);
    return {
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted
    };
  } catch (error) {
    console.error('Stripe account status error:', error);
    throw error;
  }
};

module.exports = {
  stripe,
  createConnectAccount,
  createAccountLink,
  createTransfer,
  getAccountStatus
};
