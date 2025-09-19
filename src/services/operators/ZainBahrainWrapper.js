/**
 * Zain Bahrain Operator Wrapper
 * Specific implementation for Zain Bahrain API operations
 */

const axios = require('axios');
const crypto = require('crypto');
// Import operator configuration
const { operatorConfigs, getCheckoutUrl, requiresCheckoutRedirect } = require('../../config/operators.config');

class ZainBahrainWrapper {
  constructor(environment = 'sandbox') {
    this.operatorCode = 'zain-bh';
    this.environment = environment;
    // Load operator config from centralized configuration
    this.operatorConfig = operatorConfigs[this.operatorCode];
    this.apiClient = this.createApiClient();
    this.config = this.loadConfig();
  }

  /**
   * Load Zain Bahrain specific configuration
   */
  loadConfig() {
    return {
      serviceId: process.env.OPERATOR_ZAIN_BH_SERVICE_ID,
      merchantId: process.env.MERCHANT_ID,
      redirectUrl: process.env.CHECKOUT_REDIRECT_URL || 'https://example.com/success',
      shortcode: process.env.ZAIN_BH_SHORTCODE || this.operatorConfig?.shortCode || '94005',
      keyword: process.env.ZAIN_BH_KEYWORD || 'SUB',
      pinLength: parseInt(process.env.ZAIN_BH_PIN_LENGTH || this.operatorConfig?.pinLength || 5),
      pinValiditySeconds: parseInt(process.env.ZAIN_BH_PIN_VALIDITY_SECONDS || 120),
      supportsPIN: true,
      supportsSubscription: true,
      supportsCharge: true,
      supportsSMS: true
    };
  }

  /**
   * Create axios instance with Zain Bahrain configuration
   */
  createApiClient() {
    const baseURL = this.getBaseURL();
    const auth = this.getAuthCredentials();

    const client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SLA-Digital-ZainBH/1.0',
        'Accept': 'application/json'
      }
    });

    // Add basic auth
    client.defaults.auth = {
      username: auth.username,
      password: auth.password
    };

    // Request interceptor for logging
    client.interceptors.request.use(
      (config) => {
        console.log(`[Zain BH] API Request:`, {
          method: config.method,
          url: config.url,
          params: config.params
        });
        return config;
      },
      (error) => {
        console.error(`[Zain BH] Request Error:`, error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    client.interceptors.response.use(
      (response) => {
        console.log(`[Zain BH] API Response:`, response.data);
        return response;
      },
      (error) => {
        console.error(`[Zain BH] Response Error:`, error.response?.data || error.message);
        return Promise.reject(error);
      }
    );

    return client;
  }

  /**
   * Get base URL for Zain Bahrain API calls from operator config
   */
  getBaseURL() {
    // Get base URLs from operator config
    const envConfig = this.operatorConfig?.environments || {};
    
    // Default URLs if not in config
    const defaultUrls = {
      sandbox: 'https://api.sla-alacrity.com/api/alacrity/v2.2',
      production: 'https://api.sla-alacrity.com/api/alacrity/v2.2',
      preproduction: 'https://api-pp.sla-alacrity.com/api/alacrity/v2.2'
    };

    // Use config URL if available, otherwise use default
    const configUrl = envConfig[this.environment]?.baseUrl;
    return configUrl || defaultUrls[this.environment] || defaultUrls.sandbox;
  }

  /**
   * Get authentication credentials
   */
  getAuthCredentials() {
    const envPrefix = this.environment.toUpperCase();
    return {
      username: process.env[`${envPrefix}_API_USERNAME`] || process.env.OPERATOR_ALACRITY_USERNAME,
      password: process.env[`${envPrefix}_API_PASSWORD`] || process.env.OPERATOR_ALACRITY_PASSWORD
    };
  }

  // ============================================
  // PIN MANAGEMENT
  // ============================================

  /**
   * Generate PIN for Zain Bahrain
   * Zain BH supports PIN API with 5-digit PINs (000000 in sandbox)
   */
  async generatePIN(params) {
    const requiredParams = {
      msisdn: this.formatMSISDN(params.msisdn),
      campaign: params.campaign || this.config.serviceId,
      merchant: params.merchant || this.config.merchantId,
      template: params.template || 'subscription',
      language: params.language || 'en'
    };

    try {
      const response = await this.apiClient.post('/pin', null, {
        params: requiredParams
      });

      // Handle response according to documentation
      const isSuccess = response.data.success === true || 
                       response.data.status === 'OK' || 
                       response.data.status === 'PIN_SENT';

      return {
        success: isSuccess,
        status: response.data.status || (response.data.success ? 'PIN_SENT' : 'FAILED'),
        pinSent: isSuccess,
        pinLength: this.config.pinLength,
        validitySeconds: this.config.pinValiditySeconds,
        message: isSuccess ? `PIN sent to ${requiredParams.msisdn}` : 'PIN sending failed',
        testMode: this.environment === 'sandbox',
        testPin: this.environment === 'sandbox' ? process.env.SANDBOX_TEST_PIN || '000000' : undefined,
        raw: response.data
      };
    } catch (error) {
      throw this.handleApiError(error, 'generatePIN');
    }
  }

  // ============================================
  // SUBSCRIPTION MANAGEMENT
  // ============================================

  /**
   * Create subscription with PIN verification
   * Updated to use correct /subscription/create endpoint
   */
  async createSubscription(params) {
    const requiredParams = {
      msisdn: this.formatMSISDN(params.msisdn),
      campaign: params.campaign || this.config.serviceId,
      merchant: params.merchant || this.config.merchantId
    };

    // Add PIN only if not using token
    if (!params.msisdn?.startsWith('TOKEN:')) {
      requiredParams.pin = params.pin;
      
      // Validate PIN format
      if (requiredParams.pin && requiredParams.pin.length !== this.config.pinLength) {
        throw new Error(`Invalid PIN length. Expected ${this.config.pinLength} digits`);
      }
    }

    // Add optional parameters
    if (params.language) {
      requiredParams.language = params.language;
    }
    
    if (params.trial) {
      requiredParams.trial = params.trial;
    }
    
    if (params.trial_once !== undefined) {
      requiredParams.trial_once = params.trial_once;
    }

    try {
      // Use correct endpoint: /subscription/create
      const response = await this.apiClient.post('/subscription/create', null, {
        params: requiredParams
      });

      // Handle response according to documentation
      const isSuccess = response.data.success === true || 
                       response.data.success?.type === 'subscription';
      
      // Extract transaction info if available
      const transactionInfo = response.data.success?.transaction || {};

      return {
        success: isSuccess,
        status: transactionInfo.status || (isSuccess ? 'CHARGED' : 'FAILED'),
        subscriptionId: response.data.success?.uuid || response.data.uuid,
        billId: response.data.success?.bill_id,
        transactionId: transactionInfo.transaction_id,
        msisdn: response.data.success?.msisdn || requiredParams.msisdn,
        nextPaymentTimestamp: response.data.success?.next_payment_timestamp,
        message: isSuccess ? 'Subscription created successfully' : 
                (response.data.error?.message || 'Subscription creation failed'),
        raw: response.data
      };
    } catch (error) {
      throw this.handleApiError(error, 'createSubscription');
    }
  }

  /**
   * Delete subscription
   * Updated to use correct /subscription/delete endpoint
   */
  async deleteSubscription(params) {
    const requiredParams = {
      msisdn: this.formatMSISDN(params.msisdn),
      campaign: params.campaign || params.service || this.config.serviceId,
      merchant: params.merchant || this.config.merchantId
    };

    try {
      // Use correct endpoint: /subscription/delete
      const response = await this.apiClient.post('/subscription/delete', null, {
        params: requiredParams
      });

      // According to docs, delete is async and returns {success: true}
      return {
        success: response.data.success === true,
        status: response.data.success ? 'DELETED' : 'FAILED',
        message: response.data.success ? 
                'Subscription deletion initiated. You will receive a webhook notification.' : 
                'Subscription deletion failed',
        raw: response.data
      };
    } catch (error) {
      throw this.handleApiError(error, 'deleteSubscription');
    }
  }

  /**
   * Get subscription status
   * Updated to use correct /subscription/status endpoint
   */
  async getSubscriptionStatus(params) {
    const requiredParams = {};
    
    // Support both uuid and msisdn+campaign lookup
    if (params.uuid) {
      requiredParams.uuid = params.uuid;
    } else {
      requiredParams.msisdn = this.formatMSISDN(params.msisdn);
      requiredParams.campaign = params.campaign || params.service || this.config.serviceId;
      requiredParams.merchant = params.merchant || this.config.merchantId;
    }

    try {
      // Use correct endpoint based on parameters
      const endpoint = params.uuid ? '/subscription/status' : '/subscription/latest';
      const response = await this.apiClient.post(endpoint, null, {
        params: requiredParams
      });

      // Handle successful response
      const subscriptionData = response.data;
      
      return {
        success: true,
        status: subscriptionData.status,
        subscribed: subscriptionData.status === 'ACTIVE',
        uuid: subscriptionData.uuid,
        service: subscriptionData.service,
        msisdn: subscriptionData.msisdn,
        frequency: subscriptionData.frequency,
        amount: subscriptionData.amount,
        currency: subscriptionData.currency,
        nextPaymentTimestamp: subscriptionData.next_payment_timestamp,
        transactions: subscriptionData.transactions,
        raw: response.data
      };
    } catch (error) {
      throw this.handleApiError(error, 'getSubscriptionStatus');
    }
  }

  // ============================================
  // BILLING
  // ============================================

  /**
   * One-off charge
   * Note: According to docs, one-off charge requires subscription first
   */
  async charge(params) {
    const requiredParams = {
      msisdn: this.formatMSISDN(params.msisdn),
      amount: params.amount,
      campaign: params.campaign || this.config.serviceId,
      merchant: params.merchant || this.config.merchantId,
      currency: params.currency || 'BHD'
    };

    // Add PIN if provided (for non-token charges)
    if (!params.msisdn?.startsWith('TOKEN:') && params.pin) {
      requiredParams.pin = params.pin;
    }

    // Add correlator for tracking
    if (params.correlator) {
      requiredParams.correlator = params.correlator;
    } else {
      requiredParams.correlator = this.generateCorrelator();
    }

    try {
      const response = await this.apiClient.post('/charge', null, {
        params: requiredParams
      });

      const isSuccess = response.data.status === 'SUCCESS' || 
                       response.data.status === 'CHARGED';

      return {
        success: isSuccess,
        status: response.data.status === 'SUCCESS' ? 'CHARGED' : response.data.status,
        transactionId: response.data.transaction_id,
        correlator: requiredParams.correlator,
        amount: requiredParams.amount,
        currency: requiredParams.currency,
        message: isSuccess ? `Charged ${requiredParams.amount} ${requiredParams.currency}` : 
                (response.data.message || 'Charge failed'),
        raw: response.data
      };
    } catch (error) {
      throw this.handleApiError(error, 'charge');
    }
  }

  // ============================================
  // SMS
  // ============================================

  /**
   * Send SMS
   */
  async sendSMS(params) {
    const requiredParams = {
      msisdn: this.formatMSISDN(params.msisdn),
      message: params.message,
      merchant: params.merchant || this.config.merchantId,
      shortcode: params.shortcode || this.config.shortcode
    };

    try {
      const response = await this.apiClient.post('/sms', null, {
        params: requiredParams
      });

      return {
        success: response.data.status === 'OK' || response.data.status === 'SENT',
        status: response.data.status,
        messageId: response.data.message_id,
        message: 'SMS sent successfully',
        raw: response.data
      };
    } catch (error) {
      throw this.handleApiError(error, 'sendSMS');
    }
  }

  /**
   * Send Welcome SMS with tokenized URL
   * Follows Zain BH format requirements
   */
  async sendWelcomeSMS(params) {
    const serviceName = params.service_name || 'Your Service';
    const accessUrl = params.access_url || params.url;
    
    if (!accessUrl) {
      throw new Error('Access URL is required for welcome SMS');
    }

    // Format message according to Zain BH requirements
    const message = `To access your subscription to ${serviceName}, click ${accessUrl}`;

    return this.sendSMS({
      msisdn: params.msisdn,
      message: message,
      merchant: params.merchant || this.config.merchantId,
      shortcode: params.shortcode || this.config.shortcode
    });
  }

  // ============================================
  // CHECKOUT
  // ============================================

  /**
   * Build checkout URL for Zain Bahrain
   * Uses configuration from operators.config.js
   */
  buildCheckoutUrl(params) {
    // Get checkout URL from operator config
    const baseUrl = this.getCheckoutBaseUrl();
    
    // Build query parameters
    // Note: For checkout, use 'service' instead of 'campaign'
    const queryParams = new URLSearchParams({
      merchant: params.merchant || this.config.merchantId,
      service: params.campaign || params.service || this.config.serviceId,  // Support both parameter names
      operator: 'zain-bh',
      ...(params.msisdn && { msisdn: this.formatMSISDN(params.msisdn) }),
      ...(params.price && { price: params.price }),
      ...(params.language && { language: params.language }),
      ...(params.correlator && { correlator: params.correlator })
    });

    // Add redirect parameter if required (Zain operators need this)
    if (requiresCheckoutRedirect(this.operatorCode)) {
      queryParams.append('redirect', params.redirect || this.config.redirectUrl);
    }

    return `${baseUrl}?${queryParams.toString()}`;
  }

  /**
   * Get checkout base URL from configuration
   */
  getCheckoutBaseUrl() {
    // Use the checkout URL from operator config
    const configUrl = getCheckoutUrl(this.operatorCode);
    
    // Get environment-specific checkout URL if defined in operator config
    const envConfig = this.operatorConfig?.environments || {};
    const envCheckoutUrl = envConfig[this.environment]?.checkoutUrl;
    
    // Use environment-specific URL if available, otherwise use default
    if (envCheckoutUrl) {
      return envCheckoutUrl;
    }
    
    // Handle environment-specific URLs if needed
    if (this.environment === 'sandbox' && configUrl.includes('http://')) {
      // For sandbox, keep http for testing
      return configUrl;
    } else if (this.environment === 'production' && configUrl.includes('http://')) {
      // For production, upgrade to https
      return configUrl.replace('http://', 'https://');
    }
    
    return configUrl;
  }

  // ============================================
  // WEBHOOK PROCESSING
  // ============================================

  /**
   * Process Zain Bahrain webhook
   */
  processWebhook(webhookData) {
    console.log('[Zain BH] Processing webhook:', webhookData);

    const result = {
      operator: 'zain-bh',
      processed: true,
      eventType: webhookData.eventType || webhookData.event_type,
      status: webhookData.status,
      transactionId: webhookData.transaction_id || webhookData.transactionId,
      subscriptionId: webhookData.subscription_id || webhookData.subscriptionId || webhookData.uuid,
      msisdn: webhookData.msisdn,
      timestamp: new Date().toISOString()
    };

    // Handle different webhook types
    switch (result.eventType) {
      case 'subscription.created':
        result.message = 'Subscription created via webhook';
        break;
      case 'subscription.cancelled':
      case 'subscription.deleted':
        result.message = 'Subscription cancelled via webhook';
        break;
      case 'charge.success':
        result.message = 'Charge successful via webhook';
        break;
      case 'charge.failed':
        result.message = 'Charge failed via webhook';
        break;
      default:
        result.message = 'Webhook processed';
    }

    return result;
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Format MSISDN for Zain Bahrain
   * Ensures proper 973 country code
   */
  formatMSISDN(msisdn) {
    if (!msisdn) return '';
    
    // If it's a token or ACR, return as is
    if (msisdn.startsWith('TOKEN:') || msisdn.startsWith('ACR:')) {
      return msisdn;
    }
    
    // Remove any non-digits
    let cleaned = msisdn.replace(/\D/g, '');
    
    // Add 973 country code if not present
    if (!cleaned.startsWith('973')) {
      cleaned = '973' + cleaned;
    }
    
    return cleaned;
  }

  /**
   * Generate correlator for tracking
   */
  generateCorrelator() {
    return `ZAIN-BH-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Handle API errors
   */
  handleApiError(error, operation) {
    const errorResponse = {
      success: false,
      operation: operation,
      operator: 'zain-bh',
      error: {
        message: error.message,
        code: error.response?.data?.error?.code || error.response?.data?.error_code,
        category: error.response?.data?.error?.category,
        status: error.response?.status,
        details: error.response?.data
      }
    };

    // Add suggested action based on error
    if (error.code === 'ENOTFOUND') {
      errorResponse.error.suggestedAction = 'Check your internet connection and API URL configuration';
      errorResponse.error.message = `Cannot connect to API host: ${error.hostname}`;
    } else if (error.response?.status === 401) {
      errorResponse.error.suggestedAction = 'Check API credentials in .env file';
    } else if (error.response?.status === 403) {
      errorResponse.error.suggestedAction = 'Check IP whitelist configuration';
    } else if (error.response?.status === 400) {
      errorResponse.error.suggestedAction = 'Verify request parameters and merchant ID';
    } else if (error.response?.data?.error?.code === '2010' || 
               error.response?.data?.error_code === 'INVALID_PIN') {
      errorResponse.error.suggestedAction = 'PIN is invalid or expired. Generate a new PIN';
    } else if (error.response?.data?.error_code === 'INSUFFICIENT_BALANCE') {
      errorResponse.error.suggestedAction = 'Subscriber has insufficient balance';
    } else if (error.response?.data?.error_code === 'ALREADY_SUBSCRIBED') {
      errorResponse.error.suggestedAction = 'Subscriber is already subscribed to this service';
    } else if (error.response?.data?.error_code === 'MISSING_REDIRECT') {
      errorResponse.error.suggestedAction = 'Redirect URL is required for checkout. Add redirect parameter or set CHECKOUT_REDIRECT_URL in .env';
    }

    return errorResponse;
  }
}

module.exports = ZainBahrainWrapper;