/**
 * SLA Digital API Integration - Express Server
 * Main server implementation with webhook endpoints and internal APIs
 * Focus: Zain Bahrain operator integration
 */

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');

// Import the existing SLA integration library
const { SLADigitalIntegration } = require('./src/index');

// Import SMS service
const SMSService = require('./src/services/sms.service');

// Database connection (to be implemented)
const { connectDB, getDB } = require('./src/database/connection');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Map NODE_ENV to SLA environment
// development -> sandbox, staging -> sandbox, production -> production
const SLA_ENV = NODE_ENV === 'production' ? 'production' : 'sandbox';

// Initialize SLA Integration with correct environment
const slaIntegration = new SLADigitalIntegration(SLA_ENV);

// Initialize SMS Service
const smsService = new SMSService(slaIntegration);

// ============================================
// MIDDLEWARE STACK
// ============================================

// Security headers
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: process.env.MAX_JSON_SIZE || '1mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.MAX_REQUEST_SIZE || '10mb' }));

// Request logging
if (process.env.ENABLE_REQUEST_LOGGING !== 'false') {
  app.use(morgan('combined'));
}

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || 60000),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || 100),
  message: 'Too many requests from this IP, please try again later.'
});

// Apply rate limiting to all routes
app.use('/api/', limiter);
app.use('/hooks/', limiter);

// ============================================
// IP WHITELIST MIDDLEWARE
// ============================================

const ipWhitelistMiddleware = (req, res, next) => {
  // Skip in test mode or development
  if (process.env.SKIP_IP_WHITELIST === 'true' || NODE_ENV === 'development') {
    return next();
  }

  const clientIP = req.ip || req.connection.remoteAddress;
  const whitelistedIPs = process.env.WHITELISTED_IPS?.split(',') || [];

  // Check if IP is whitelisted
  const isWhitelisted = whitelistedIPs.some(allowedIP => {
    return allowedIP.trim() === clientIP || 
           allowedIP.includes('/') && clientIP.startsWith(allowedIP.split('/')[0]);
  });

  if (!isWhitelisted) {
    console.error(`Unauthorized IP attempt: ${clientIP}`);
    return res.status(403).json({ error: 'Forbidden: IP not whitelisted' });
  }

  next();
};

// ============================================
// WEBHOOK SIGNATURE VALIDATION
// ============================================

const validateWebhookSignature = (req, res, next) => {
  const signature = req.headers['x-webhook-signature'];
  const webhookSecret = process.env.WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!signature) {
    return res.status(401).json({ error: 'Missing webhook signature' });
  }

  // Calculate expected signature
  const payload = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(payload)
    .digest('hex');

  if (signature !== expectedSignature) {
    console.error('Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  next();
};

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================

app.get('/health', async (req, res) => {
  try {
    // Check database connection
    const db = await getDB();
    const dbHealthy = db ? true : false;

    // Get SLA integration health
    const slaHealth = await slaIntegration.healthCheck();

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: NODE_ENV,
      sla_environment: SLA_ENV,
      database: dbHealthy ? 'connected' : 'disconnected',
      sla: slaHealth,
      memory: process.memoryUsage(),
      version: require('./package.json').version
    };

    res.status(200).json(health);
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ============================================
// ZAIN BAHRAIN API ENDPOINTS
// ============================================

// Generate PIN for Zain Bahrain
app.post('/api/zain-bh/pin', 
  ipWhitelistMiddleware,
  async (req, res) => {
    try {
      const { msisdn, campaign, merchant } = req.body;
      
      if (!msisdn || !campaign) {
        return res.status(400).json({ 
          error: 'Missing required parameters: msisdn, campaign' 
        });
      }

      const result = await slaIntegration.generatePIN('zain-bh', {
        msisdn,
        campaign: campaign || process.env.OPERATOR_ZAIN_BH_SERVICE_ID,
        merchant: merchant || process.env.MERCHANT_ID,
        template: 'subscription',
        language: 'en'
      });

      // In sandbox, PIN is always 000000
      if (SLA_ENV === 'sandbox') {
        result.testPin = process.env.SANDBOX_TEST_PIN || '000000';
      }

      res.json({
        success: true,
        message: 'PIN sent successfully',
        data: result
      });
    } catch (error) {
      console.error('PIN generation error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Create subscription for Zain Bahrain (UPDATED to handle TOKEN)
app.post('/api/zain-bh/subscription',
  ipWhitelistMiddleware,
  async (req, res) => {
    try {
      const { msisdn, pin, campaign, merchant, trial, language } = req.body;
      
      // Check if using TOKEN-based subscription
      const isToken = msisdn?.startsWith('TOKEN:');
      
      // Validate required parameters based on flow
      if (!msisdn) {
        return res.status(400).json({ 
          error: 'Missing required parameter: msisdn (or token)' 
        });
      }
      
      // PIN is only required for non-token subscriptions
      if (!isToken && !pin) {
        return res.status(400).json({ 
          error: 'Missing required parameter: pin (not needed if using token from checkout)' 
        });
      }

      // Build subscription parameters
      const subscriptionParams = {
        msisdn,
        campaign: campaign || process.env.OPERATOR_ZAIN_BH_SERVICE_ID,
        merchant: merchant || process.env.MERCHANT_ID
      };
      
      // Only include pin if not using token
      if (!isToken) {
        subscriptionParams.pin = pin;
      }
      
      // Add optional parameters
      if (trial) {
        subscriptionParams.trial = trial;
      }
      
      if (language) {
        subscriptionParams.language = language;
      }

      const result = await slaIntegration.createSubscription('zain-bh', subscriptionParams);

      // Store subscription in database
      const db = await getDB();
      if (db && result.success) {
        await db.query(
          `INSERT INTO subscriptions (
            subscription_id, operator_code, msisdn, campaign_id,
            merchant_id, status, created_at, is_token_based
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            result.subscriptionId || result.uuid || crypto.randomUUID(),
            'zain-bh',
            isToken ? result.msisdn : msisdn, // Store actual MSISDN from response if token was used
            campaign || process.env.OPERATOR_ZAIN_BH_SERVICE_ID,
            merchant || process.env.MERCHANT_ID,
            result.status || 'active',
            new Date(),
            isToken
          ]
        );
      }

      res.json({
        success: true,
        message: 'Subscription created successfully',
        data: result,
        flowType: isToken ? 'checkout_token' : 'pin_api'
      });
    } catch (error) {
      console.error('Subscription creation error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// One-off charge for Zain Bahrain (UPDATED to handle TOKEN)
app.post('/api/zain-bh/charge',
  ipWhitelistMiddleware,
  async (req, res) => {
    try {
      const { msisdn, pin, amount, campaign, merchant, currency } = req.body;
      
      // Check if using TOKEN
      const isToken = msisdn?.startsWith('TOKEN:');
      
      if (!msisdn || !amount) {
        return res.status(400).json({ 
          error: 'Missing required parameters: msisdn (or token), amount' 
        });
      }
      
      // PIN is only required for non-token charges
      if (!isToken && !pin) {
        return res.status(400).json({ 
          error: 'Missing required parameter: pin (not needed if using token)' 
        });
      }

      const chargeParams = {
        msisdn,
        amount,
        currency: currency || 'BHD',
        campaign: campaign || process.env.OPERATOR_ZAIN_BH_SERVICE_ID,
        merchant: merchant || process.env.MERCHANT_ID
      };
      
      // Only include pin if not using token
      if (!isToken) {
        chargeParams.pin = pin;
      }

      const result = await slaIntegration.charge('zain-bh', chargeParams);

      // Store transaction in database
      const db = await getDB();
      if (db) {
        await db.query(
          `INSERT INTO transactions (
            transaction_id, operator_code, msisdn, amount,
            status, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            result.transactionId || crypto.randomUUID(),
            'zain-bh',
            msisdn,
            amount,
            result.status,
            new Date()
          ]
        );
      }

      res.json({
        success: true,
        message: 'Charge completed successfully',
        data: result
      });
    } catch (error) {
      console.error('Charge error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Delete subscription for Zain Bahrain (UPDATED to handle TOKEN)
app.delete('/api/zain-bh/subscription',
  ipWhitelistMiddleware,
  async (req, res) => {
    try {
      const { msisdn, campaign, merchant } = req.body;
      
      if (!msisdn) {
        return res.status(400).json({ 
          error: 'Missing required parameter: msisdn (or the same token used for subscription)' 
        });
      }

      const result = await slaIntegration.deleteSubscription('zain-bh', {
        msisdn,
        campaign: campaign || process.env.OPERATOR_ZAIN_BH_SERVICE_ID,
        merchant: merchant || process.env.MERCHANT_ID
      });

      // Update subscription status in database
      const db = await getDB();
      if (db && result.success) {
        const isToken = msisdn.startsWith('TOKEN:');
        await db.query(
          `UPDATE subscriptions 
           SET status = 'cancelled', cancelled_at = $1
           WHERE operator_code = 'zain-bh' 
           AND (msisdn = $2 OR (is_token_based = true AND subscription_id IN 
             (SELECT subscription_id FROM subscriptions WHERE operator_code = 'zain-bh' LIMIT 1)
           ))`,
          [new Date(), msisdn]
        );
      }

      res.json({
        success: true,
        message: 'Subscription deleted successfully',
        data: result
      });
    } catch (error) {
      console.error('Subscription deletion error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Get checkout URL for Zain Bahrain (FIXED: Added redirect_url, correlator, locale)
app.get('/api/zain-bh/checkout-url',
  (req, res) => {
    try {
      const { 
        msisdn, 
        campaign, 
        merchant, 
        price, 
        locale,           // Changed from language to locale
        redirect_url,     // ADDED: Required parameter
        correlator        // ADDED: Optional parameter
      } = req.query;
      
      // Validate required parameter
      if (!redirect_url) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameter: redirect_url'
        });
      }
      
      // Build checkout parameters
      const checkoutParams = {
        campaign: campaign || process.env.OPERATOR_ZAIN_BH_SERVICE_ID,
        merchant: merchant || process.env.MERCHANT_ID,
        redirect_url      // REQUIRED for checkout
      };
      
      // Add optional parameters
      if (msisdn) {
        checkoutParams.msisdn = msisdn;
      }
      
      if (price) {
        checkoutParams.price = price;
      }
      
      if (locale) {
        checkoutParams.locale = locale;  // Using locale instead of language
      }
      
      if (correlator) {
        checkoutParams.correlator = correlator;
      }
      
      const checkoutUrl = slaIntegration.getCheckoutUrl('zain-bh', checkoutParams);

      res.json({
        success: true,
        checkoutUrl: checkoutUrl,
        operator: 'zain-bh',
        environment: SLA_ENV,
        checkoutBase: SLA_ENV === 'sandbox' 
          ? 'http://msisdn-sandbox.sla-alacrity.com/purchase'
          : 'http://msisdn.sla-alacrity.com/purchase',
        parameters: {
          merchant: checkoutParams.merchant,
          service: checkoutParams.campaign,
          redirect_url: checkoutParams.redirect_url,
          locale: checkoutParams.locale || 'en',
          correlator: checkoutParams.correlator,
          price: checkoutParams.price
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// ============================================
// SMS ENDPOINTS
// ============================================

// Send generic SMS for Zain Bahrain
app.post('/api/zain-bh/sms',
  ipWhitelistMiddleware,
  [
    body('msisdn').notEmpty().withMessage('MSISDN is required'),
    body('message').notEmpty().withMessage('Message is required')
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { msisdn, message, campaign, merchant } = req.body;

      // Validate MSISDN format
      if (!smsService.validateMSISDN(msisdn, 'zain-bh')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid MSISDN format for Zain Bahrain. Expected format: 973XXXXXXXX'
        });
      }

      const result = await smsService.sendSMS('zain-bh', {
        msisdn,
        message,
        campaign,
        merchant
      });

      // Store SMS record in database
      const db = await getDB();
      if (db && result.success) {
        await db.query(
          `INSERT INTO sms_logs (
            correlator, operator_code, msisdn, message, 
            status, sent_at
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            result.correlator,
            'zain-bh',
            msisdn,
            message.substring(0, 160), // Store first 160 chars
            result.success ? 'sent' : 'failed',
            new Date()
          ]
        );
      }

      res.json(result);
    } catch (error) {
      console.error('SMS error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Send Welcome SMS for Zain Bahrain
app.post('/api/zain-bh/welcome-sms',
  ipWhitelistMiddleware,
  [
    body('msisdn').notEmpty().withMessage('MSISDN is required'),
    body('serviceName').notEmpty().withMessage('Service name is required'),
    body('accessUrl').isURL().withMessage('Valid access URL is required')
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { 
        msisdn, 
        serviceName, 
        accessUrl, 
        subscriptionId,
        language,
        campaign,
        merchant 
      } = req.body;

      // Validate MSISDN format
      if (!smsService.validateMSISDN(msisdn, 'zain-bh')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid MSISDN format for Zain Bahrain. Expected format: 973XXXXXXXX'
        });
      }

      // Format access URL with tracking parameters
      const formattedUrl = smsService.formatAccessUrl(accessUrl, {
        operator: 'zain-bh',
        sub_id: subscriptionId,
        source: 'welcome_sms',
        timestamp: Date.now()
      });

      const result = await smsService.sendWelcomeSMS('zain-bh', {
        msisdn,
        serviceName,
        accessUrl: formattedUrl,
        subscriptionId,
        language: language || 'en',
        campaign,
        merchant
      });

      // Store welcome SMS record in database
      const db = await getDB();
      if (db && result.success) {
        await db.query(
          `INSERT INTO sms_logs (
            correlator, operator_code, msisdn, message, 
            message_type, subscription_id, status, sent_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            result.correlator,
            'zain-bh',
            msisdn,
            result.messageContent,
            'welcome',
            subscriptionId,
            result.success ? 'sent' : 'failed',
            new Date()
          ]
        );
      }

      res.json(result);
    } catch (error) {
      console.error('Welcome SMS error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Send batch SMS for Zain Bahrain
app.post('/api/zain-bh/batch-sms',
  ipWhitelistMiddleware,
  [
    body('recipients').isArray({ min: 1 }).withMessage('Recipients array is required'),
    body('message').notEmpty().withMessage('Message is required')
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { recipients, message, campaign, merchant } = req.body;

      // Validate all MSISDNs
      const invalidNumbers = recipients.filter(msisdn => 
        !smsService.validateMSISDN(msisdn, 'zain-bh')
      );

      if (invalidNumbers.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid MSISDN format detected',
          invalidNumbers
        });
      }

      const result = await smsService.sendBatchSMS('zain-bh', {
        recipients,
        message,
        campaign,
        merchant
      });

      // Store batch record in database
      const db = await getDB();
      if (db) {
        await db.query(
          `INSERT INTO batch_sms_logs (
            batch_id, operator_code, total_recipients, successful, 
            failed, message, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            result.batchId,
            'zain-bh',
            result.total,
            result.successful,
            result.failed,
            message.substring(0, 160),
            new Date()
          ]
        );
      }

      res.json(result);
    } catch (error) {
      console.error('Batch SMS error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// ============================================
// WEBHOOK ENDPOINTS
// ============================================

// Main Alacrity webhook endpoint
app.post('/hooks/alacrity', 
  validateWebhookSignature,
  async (req, res) => {
    try {
      const webhookData = req.body;
      console.log('Received Alacrity webhook:', webhookData);

      // Store webhook event in database
      const db = await getDB();
      if (db) {
        await db.query(
          `INSERT INTO webhook_events (
            event_id, operator, event_type, payload, received_at
          ) VALUES ($1, $2, $3, $4, $5)`,
          [
            webhookData.eventId || crypto.randomUUID(),
            webhookData.operator || 'alacrity',
            webhookData.eventType || 'unknown',
            JSON.stringify(webhookData),
            new Date()
          ]
        );
      }

      // Process webhook through the integration library
      const result = await slaIntegration.processWebhook(webhookData);

      res.status(200).json({
        success: true,
        message: 'Webhook processed successfully',
        result: result
      });
    } catch (error) {
      console.error('Webhook processing error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Zain Bahrain specific webhook endpoint
app.post('/hooks/zain-bh',
  ipWhitelistMiddleware,
  async (req, res) => {
    try {
      const webhookData = req.body;
      console.log('Received Zain Bahrain webhook:', webhookData);

      // Store webhook event
      const db = await getDB();
      if (db) {
        await db.query(
          `INSERT INTO webhook_events (
            event_id, operator, event_type, payload, received_at
          ) VALUES ($1, $2, $3, $4, $5)`,
          [
            webhookData.eventId || crypto.randomUUID(),
            'zain-bh',
            webhookData.eventType || 'notification',
            JSON.stringify(webhookData),
            new Date()
          ]
        );
      }

      // Process Zain-specific webhook data
      const result = await slaIntegration.processWebhook({
        ...webhookData,
        operator: 'zain-bh'
      });

      res.status(200).json({
        success: true,
        operator: 'zain-bh',
        result: result
      });
    } catch (error) {
      console.error('Zain Bahrain webhook error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// ============================================
// INTERNAL API ENDPOINTS
// ============================================

// Test Zain Bahrain credentials
app.post('/internal/test-credentials/zain-bh',
  ipWhitelistMiddleware,
  async (req, res) => {
    try {
      const testClient = new SLADigitalIntegration(SLA_ENV);
      const config = testClient.getOperatorConfig('zain-bh');

      res.json({
        success: true,
        operator: 'zain-bh',
        node_environment: NODE_ENV,
        sla_environment: SLA_ENV,
        configured: !!config,
        features: config ? {
          supportsPIN: testClient.supportsPINAPI('zain-bh'),
          flowType: config.flowType,
          country: config.country,
          pinLength: process.env.ZAIN_BH_PIN_LENGTH || 6,
          serviceId: process.env.OPERATOR_ZAIN_BH_SERVICE_ID ? 'configured' : 'missing',
          checkoutUrl: config.checkoutUrl
        } : null
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Get Zain Bahrain transactions
app.get('/internal/zain-bh/transactions',
  ipWhitelistMiddleware,
  async (req, res) => {
    try {
      const { limit = 10 } = req.query;
      
      const db = await getDB();
      if (!db) {
        return res.status(503).json({ error: 'Database unavailable' });
      }

      const result = await db.query(
        `SELECT * FROM transactions 
         WHERE operator_code = 'zain-bh'
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
      );

      res.json({
        success: true,
        operator: 'zain-bh',
        count: result.rows.length,
        transactions: result.rows
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: NODE_ENV === 'production' ? 'An error occurred' : err.message,
    timestamp: new Date().toISOString()
  });
});

// ============================================
// SERVER STARTUP & SHUTDOWN
// ============================================

async function startServer() {
  try {
    // Connect to database
    console.log('Connecting to PostgreSQL...');
    await connectDB();
    console.log('Database connected successfully');

    // Start Express server
    const server = app.listen(PORT, () => {
      console.log(`
        ========================================
        SLA Digital API Integration Server
        ========================================
        Node Environment: ${NODE_ENV}
        SLA Environment: ${SLA_ENV}
        Port: ${PORT}
        Database: PostgreSQL
        
        Zain Bahrain Endpoints:
        - POST   /api/zain-bh/pin           - Generate OTP PIN
        - POST   /api/zain-bh/subscription  - Create subscription (PIN or TOKEN)
        - POST   /api/zain-bh/charge        - One-off charge (PIN or TOKEN)
        - DELETE /api/zain-bh/subscription  - Cancel subscription
        - GET    /api/zain-bh/checkout-url  - Get checkout URL (with redirect_url)
        
        SMS Endpoints:
        - POST   /api/zain-bh/sms           - Send generic SMS
        - POST   /api/zain-bh/welcome-sms   - Send welcome SMS
        - POST   /api/zain-bh/batch-sms     - Send batch SMS
        
        Webhook URLs:
        - POST   /hooks/alacrity            - Main webhook
        - POST   /hooks/zain-bh             - Zain Bahrain webhook
        
        Health Check:
        - GET    /health                    - Server health status
        ========================================
      `);
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal) => {
      console.log(`\nReceived ${signal}, starting graceful shutdown...`);
      
      server.close(() => {
        console.log('HTTP server closed');
      });

      // Close database connections
      const db = await getDB();
      if (db) {
        await db.end();
        console.log('Database connections closed');
      }

      process.exit(0);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
if (require.main === module) {
  startServer();
}

module.exports = app;
