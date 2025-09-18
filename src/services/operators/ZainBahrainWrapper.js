/**
 * Zain Bahrain Operator Wrapper
 * Specific implementation for Zain Bahrain API operations
 */

const axios = require('axios');
const crypto = require('crypto');

class ZainBahrainWrapper {
  constructor(environment = 'sandbox') {
    this.operatorCode = 'zain-bh';
    this.environment = environment;
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
      shortcode: process.env.ZAIN_BH_SHORTCODE || '94005',
      keyword: process.env.ZAIN_BH_KEYWORD || 'SUB',
      pinLength: parseInt(process.env.ZAIN_BH_PIN_LENGTH || 6),
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
        'User-Agent': 'SLA-Digital-ZainBH/1.0'
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
   * Get base URL for Zain Bahrain
   * Zain uses special msisdn.sla-alacrity.com domain
   */
  getBaseURL() {
    const envUrls = {
      sandbox: 'https://msisdn.sla-alacrity.com/api/alacrity/v2.2',
      production: 'https://msisdn.sla-alacrity.com/api/alacrity/v2.2',
      preproduction: 'https://msisdn-pp.sla-alacrity.com/api/alacrity/v2.2'
    };

    return envUrls[this.environment] || envUrls.sandbox;
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
   * Zain BH supports PIN API with 6-digit PINs
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

      return {
        success: response.data.status === 'OK' || response.data.status === 'PIN_SENT',
        status: response.data.status,
        pinSent: true,
        pinLength: this.config.pinLength,
        validitySeconds: this.config.pinValiditySeconds,
        message: `PIN sent to ${requiredParams.msisdn}`,
        testMode: this.environment === 'sandbox',
        testPin: this.environment === 'sandbox' ? process.env.SANDBOX_TEST_PIN : undefined,
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
   */
  async createSubscription(params) {
    const requiredParams = {
      msisdn: this.formatMSISDN(params.msisdn),
      pin: params.pin,
      campaign: params.campaign || this.config.serviceId,
      merchant: params.merchant || this.config.merchantId
    };

    // Validate PIN format
    if (requiredParams.pin && requiredParams.pin.length !== this.config.pinLength) {
      throw new Error(`Invalid PIN length. Expected ${this.config.pinLength} digits`);
    }

    try {
      const response = await this.apiClient.post('/subscription', null, {
        params: requiredParams
      });

      // Zain returns SUCCESS instead of CHARGED
      const isSuccess = response.data.status === 'SUCCESS' || response.data.status === 'CHARGED';

      return {
        success: isSuccess,
        status: response.data.status === 'SUCCESS' ? 'CHARGED' : response.data.status,
        subscriptionId: response.data.subscription_id,
        transactionId: response.data.transaction_id,
        msisdn: requiredParams.msisdn,
        message: isSuccess ? 'Subscription created successfully' : response.data.message,
        raw: response.data
      };
    } catch (error) {
      throw this.handleApiError(error, 'createSubscription');
    }
  }

  /**
   * Delete subscription
   */
  async deleteSubscription(params) {
    const requiredParams = {
      msisdn: this.formatMSISDN(params.msisdn),
      service: params.service || params.campaign || this.config.serviceId,
      merchant: params.merchant || this.config.merchantId
    };

    try {
      const response = await this.apiClient.post('/unsubscribe', null, {
        params: requiredParams
      });

      return {
        success: response.data.status === 'OK' || response.data.status === 'SUCCESS',
        status: response.data.status,
        message: 'Subscription cancelled successfully',
        raw: response.data
      };
    } catch (error) {
      throw this.handleApiError(error, 'deleteSubscription');
    }
  }

  /**
   * Get subscription status
   */
  async getSubscriptionStatus(params) {
    const requiredParams = {
      msisdn: this.formatMSISDN(params.msisdn),
      service: params.service || params.campaign || this.config.serviceId,
      merchant: params.merchant || this.config.merchantId
    };

    try {
      const response = await this.apiClient.post('/status', null, {
        params: requiredParams
      });

      return {
        success: true,
        status: response.data.status,
        subscribed: response.data.status === 'ACTIVE',
        details: response.data,
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
   */
  async charge(params) {
    const requiredParams = {
      msisdn: this.formatMSISDN(params.msisdn),
      amount: params.amount,
      campaign: params.campaign || this.config.serviceId,
      merchant: params.merchant || this.config.merchantId,
      currency: params.currency || 'BHD'
    };

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

      const isSuccess = response.data.status === 'SUCCESS' || response.data.status === 'CHARGED';

      return {
        success: isSuccess,
        status: response.data.status === 'SUCCESS' ? 'CHARGED' : response.data.status,
        transactionId: response.data.transaction_id,
        correlator: requiredParams.correlator,
        amount: requiredParams.amount,
        currency: requiredParams.currency,
        message: isSuccess ? `Charged ${requiredParams.amount} ${requiredParams.currency}` : response.data.message,
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

  // ============================================
  // CHECKOUT
  // ============================================

  /**
   * Build checkout URL for Zain Bahrain
   */
  buildCheckoutUrl(params) {
    const baseUrl = this.getCheckoutBaseUrl();
    const queryParams = new URLSearchParams({
      campaign: params.campaign || this.config.serviceId,
      merchant: params.merchant || this.config.merchantId,
      operator: 'zain-bh',
      ...(params.msisdn && { msisdn: this.formatMSISDN(params.msisdn) }),
      ...(params.price && { price: params.price }),
      ...(params.language && { language: params.language }),
      ...(params.correlator && { correlator: params.correlator })
    });

    return `${baseUrl}?${queryParams.toString()}`;
  }

  /**
   * Get checkout base URL
   */
  getCheckoutBaseUrl() {
    const envUrls = {
      sandbox: 'https://msisdn.sla-alacrity.com/checkout',
      production: 'https://msisdn.sla-alacrity.com/checkout',
      preproduction: 'https://msisdn-pp.sla-alacrity.com/checkout'
    };

    return envUrls[this.environment] || envUrls.sandbox;
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
      subscriptionId: webhookData.subscription_id || webhookData.subscriptionId,
      msisdn: webhookData.msisdn,
      timestamp: new Date().toISOString()
    };

    // Handle different webhook types
    switch (result.eventType) {
      case 'subscription.created':
        result.message = 'Subscription created via webhook';
        break;
      case 'subscription.cancelled':
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
    
    // Remove any non-digits
    let cleaned = msisdn.replace(/\\D/g, '');
    
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
        code: error.response?.data?.error_code,
        status: error.response?.status,
        details: error.response?.data
      }
    };

    // Add suggested action based on error
    if (error.response?.status === 401) {
      errorResponse.error.suggestedAction = 'Check API credentials in .env file';
    } else if (error.response?.status === 403) {
      errorResponse.error.suggestedAction = 'Check IP whitelist configuration';
    } else if (error.response?.status === 400) {
      errorResponse.error.suggestedAction = 'Verify request parameters';
    } else if (error.response?.data?.error_code === 'INVALID_PIN') {
      errorResponse.error.suggestedAction = 'PIN is invalid or expired. Generate a new PIN';
    } else if (error.response?.data?.error_code === 'INSUFFICIENT_BALANCE') {
      errorResponse.error.suggestedAction = 'Subscriber has insufficient balance';
    } else if (error.response?.data?.error_code === 'ALREADY_SUBSCRIBED') {
      errorResponse.error.suggestedAction = 'Subscriber is already subscribed to this service';
    }

    return errorResponse;
  }
}

module.exports = ZainBahrainWrapper;