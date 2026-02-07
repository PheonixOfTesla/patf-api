const Business = require('../models/Business');

const authenticateApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;

  if (!apiKey) {
    return res.status(401).json({ success: false, error: 'API key required' });
  }

  try {
    const business = await Business.findOne({ apiKey, isActive: true });

    if (!business) {
      return res.status(401).json({ success: false, error: 'Invalid API key' });
    }

    req.business = business;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ success: false, error: 'Authentication failed' });
  }
};

module.exports = { authenticateApiKey };
