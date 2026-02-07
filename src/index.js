const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const referralRoutes = require('./routes/referrals');
const businessRoutes = require('./routes/business');
const webhookRoutes = require('./routes/webhooks');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'PATF API', version: '1.0.0' });
});

// API Routes
app.use('/api/v1/referrals', referralRoutes);
app.use('/api/v1/business', businessRoutes);
app.use('/api/v1/webhooks', webhookRoutes);

// Dashboard endpoint
const dashboardHandlers = require('./routes/dashboard');
app.get('/api/v1/dashboard', ...dashboardHandlers);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

// Connect to MongoDB and start server
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/patf';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`PATF API running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

module.exports = app;
