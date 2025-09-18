/**
 * SLA Digital API Client
 * Core client for handling all SLA Digital API interactions
 */

const axios = require('axios');
const crypto = require('crypto');
const { operatorConfigs } = require('../../config/operators.config');
const { apiConfig, getEndpointUrl } = require('../../config/api.config');

class SLAClient {
  constructor(environment = 'sandbox', credentials = null) {
    this.environment = environment;
    this.config = apiConfig.environments[environment];
    
    if (!this.config) {
      throw new Error(`Invalid environment: ${environment}. Valid options: sandbox, production, preproduction`);
    }

    // Load credentials from environment or provided object
    this.credentials = credentials || this.loadCredentials(environment);
    
    // Initialize axios instance with base configuration
    this.httpClient = axios.create({
      baseURL: this.config.baseUrl,
      timeout: apiConfig.http.timeout,
      headers: {
        'Accept': apiConfig.http.accept,
        'Content-Type': apiConfig.http.contentType
      }
    });

    // Request/Response interceptors for logging
    this.setupInterceptors();

    // Store for ACR mappings (Telenor operators)
    this.acrMappings = new Map();

    // Store for pending async operations
    this.pendingOperations = new Map();
  }

  /**
   * Load credentials from environment variables
   */
  loadCredentials(environment) {
    const envPrefix = environment.toUpperCase();
    const username = process.env[`${envPrefix}_API_USERNAME`];
    const password = process.env[`${envPrefix}_API_PASSWORD`];

    if (!username || !password) {
      throw new Error(`Missing API credentials for ${environment}. Please set ${envPrefix}_API_USERNAME and ${envPrefix}_API_PASSWORD`);
    }

    return { username, password };
  }

  /**
   * Setup axios interceptors for logging and error handling
   */
  setupInterceptors() {
    // Request interceptor
    this.httpClient.interceptors.request.use(
      (config) => {
        // Add Basic Auth
        const auth = Buffer.from(`${this.credentials.username}:${this.credentials.password}`).toString('base64');
        config.headers['Authorization'] = `Basic ${auth}`;
        
        // Log request
        console.log(`[SLA API Request] ${config.method.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('[SLA API Request Error]', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.httpClient.interceptors.response.use(
      (response) => {
        console.log(`[SLA API Response] Status: ${response.status}`);
        return response;
      },
      (error) => {
        if (error.response) {
          console.error(`[SLA API Error] Status: ${error.response.status}`, error.response.data);
        } else {
          console.error('[SLA API Error]', error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Build query string from parameters
   */
  buildQueryString(params) {
    return Object.entries(params)
      .filter(([_, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
  }

  /**
   * Make API request
   */
  async makeRequest(endpoint, params, operator) {
    const operatorConfig = operatorConfigs[operator];
    if (!operatorConfig) {
      throw new Error(`Unknown operator: ${operator}`);
    }

    // Add operator-specific parameters
    const enrichedParams = this.enrichParameters(params, operator);

    // Build URL with query parameters (SLA uses query params, not body)
    const queryString = this.buildQueryString(enrichedParams);
    const url = `${endpoint}?${queryString}`;

    try {
      // All SLA API calls use POST with parameters in URL
      const response = await this.httpClient.post(url, null);
      
      // Handle operator-specific response transformations
      return this.handleResponse(response.data, operator);
    } catch (error) {
      throw this.handleError(error, operator);
    }
  }

  /**
   * Enrich parameters with operator-specific requirements
   */
  enrichParameters(params, operator) {
    const config = operatorConfigs[operator];
    const enriched = { ...params };

    // Add correlator if required
    if (config.requiresCorrelator && !enriched.correlator) {
      enriched.correlator = this.generateCorrelator();
    }

    // Add transaction ID if required
    if (config.requiresTransactionId && !enriched.transaction_id) {
      enriched.transaction_id = this.generateTransactionId();
    }

    // Add amount if required (Ooredoo Kuwait)
    if (config.requiresAmount && !enriched.amount) {
      throw new Error(`Amount is required for ${operator}`);
    }

    // Handle sandbox PIN
    if (this.environment === 'sandbox' && enriched.pin) {
      enriched.pin = '000000';
    }

    return enriched;
  }

  /**
   * Handle operator-specific response transformations
   */
  handleResponse(response, operator) {
    const config = operatorConfigs[operator];

    // Handle Zain operators' SUCCESS status
    if (config.statusResponse === 'SUCCESS' && response.success) {
      if (response.success.transaction?.status === 'SUCCESS') {
        response.success.transaction.status = 'CHARGED';
      }
    }

    // Store ACR mapping for Telenor operators
    if (config.usesACR && response.success?.msisdn) {
      const acr = response.success.msisdn;
      if (acr.startsWith('telenor-')) {
        this.acrMappings.set(response.success.uuid, acr);
      }
    }

    // Handle async operators
    if (config.asyncResponse && response.status === 'PENDING') {
      const operationId = response.transaction_id || response.correlator;
      this.pendingOperations.set(operationId, {
        operator,
        timestamp: Date.now(),
        response
      });
    }

    return response;
  }

  /**
   * Handle API errors
   */
  handleError(error, operator) {
    const config = operatorConfigs[operator];
    
    if (error.response?.data?.error) {
      const apiError = error.response.data.error;
      const errorMessage = `[${apiError.category}] ${apiError.code}: ${apiError.message}`;
      
      const enhancedError = new Error(errorMessage);
      enhancedError.code = apiError.code;
      enhancedError.category = apiError.category;
      enhancedError.operator = operator;
      
      return enhancedError;
    }

    error.operator = operator;
    return error;
  }

  /**
   * Generate correlator for tracking
   */
  generateCorrelator() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Generate transaction ID
   */
  generateTransactionId() {
    return `TXN_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  // ============= SUBSCRIPTION APIS =============

  /**
   * Create subscription
   */
  async createSubscription(operator, params) {
    const config = operatorConfigs[operator];

    // Validate required parameters
    const required = ['campaign', 'merchant'];
    
    // Check if PIN or token is required
    if (!params.msisdn?.startsWith('TOKEN:')) {
      if (config.flow !== 'checkout_only' && config.flow !== 'checkout_async') {
        required.push('msisdn');
        if (!config.flow?.includes('checkout')) {
          required.push('pin');
        }
      }
    }

    for (const field of required) {
      if (!params[field]) {
        throw new Error(`Missing required parameter: ${field}`);
      }
    }

    // Handle UK operators - they don't need create call after checkout
    if (['vodafone-uk', 'three-uk', 'o2-uk', 'ee-uk'].includes(operator)) {
      if (!params.msisdn?.startsWith('TOKEN:')) {
        throw new Error('UK operators require checkout flow with token');
      }
    }

    const endpoint = apiConfig.endpoints.subscription.create;
    return this.makeRequest(endpoint, params, operator);
  }

  /**
   * Delete subscription
   */
  async deleteSubscription(operator, params) {
    const config = operatorConfigs[operator];

    if (config.noDeleteAPI) {
      throw new Error(`Delete API not available for ${operator}`);
    }

    // Handle ACR for Telenor
    if (config.usesACR && params.uuid) {
      const acr = this.acrMappings.get(params.uuid);
      if (acr) {
        params.msisdn = acr;
      } else {
        throw new Error('ACR not found for subscription. Unable to delete.');
      }
    }

    const endpoint = apiConfig.endpoints.subscription.delete;
    return this.makeRequest(endpoint, params, operator);
  }

  /**
   * Get subscription status
   */
  async getSubscriptionStatus(operator, params) {
    const endpoint = apiConfig.endpoints.subscription.status;
    return this.makeRequest(endpoint, params, operator);
  }

  // ============= BILLING APIS =============

  /**
   * One-off charge
   */
  async charge(operator, params) {
    const config = operatorConfigs[operator];

    // Validate required parameters
    const required = ['campaign', 'merchant', 'amount', 'currency'];
    
    if (!params.msisdn?.startsWith('TOKEN:')) {
      required.push('msisdn');
      if (!params.pin && config.flow !== 'checkout_only') {
        required.push('pin');
      }
    }

    for (const field of required) {
      if (!params[field]) {
        throw new Error(`Missing required parameter: ${field}`);
      }
    }

    const endpoint = apiConfig.endpoints.billing.charge;
    return this.makeRequest(endpoint, params, operator);
  }

  // ============= PIN API =============

  /**
   * Generate PIN
   */
  async generatePIN(operator, params) {
    const config = operatorConfigs[operator];

    if (!this.supportsPINAPI(operator)) {
      throw new Error(`PIN API not supported for ${operator}`);
    }

    // Add operator-specific requirements
    if (config.requiresAmount) {
      if (!params.amount) {
        throw new Error(`Amount is required for PIN generation with ${operator}`);
      }
    }

    // Add fraud token for Mobily
    if (config.requiresFraudToken && !params.fraud_token) {
      throw new Error(`Fraud token is required for ${operator}`);
    }

    const endpoint = apiConfig.endpoints.pin.generate;
    return this.makeRequest(endpoint, params, operator);
  }

  /**
   * Check if operator supports PIN API
   */
  supportsPINAPI(operator) {
    const config = operatorConfigs[operator];
    return config && (
      config.flow === 'pin_api_allowed' ||
      config.flow === 'checkout_or_pin' ||
      config.flow === 'pin_with_fraud_prevention' ||
      config.flow === 'checkout_or_api'
    );
  }

  // ============= SMS API =============

  /**
   * Send SMS
   */
  async sendSMS(operator, params) {
    const config = operatorConfigs[operator];

    if (config.noSMS) {
      throw new Error(`SMS API not supported for ${operator}`);
    }

    // Handle dynamic SMS for Mobily
    if (operator === 'mobily-sa' && params.dynamic_sms) {
      params.dynamic_sms = true;
    }

    const endpoint = apiConfig.endpoints.sms.send;
    return this.makeRequest(endpoint, params, operator);
  }

  // ============= CHECKOUT HELPERS =============

  /**
   * Build checkout URL
   */
  buildCheckoutUrl(operator, params) {
    const config = operatorConfigs[operator];
    
    // Get base checkout URL
    let checkoutUrl = config.checkoutUrl || `${this.config.checkoutUrl}/purchase`;
    
    // Handle environment-specific URLs
    if (this.environment === 'sandbox') {
      checkoutUrl = checkoutUrl.replace('checkout.sla-alacrity.com', 'checkout-sandbox.sla-alacrity.com');
    }

    // Handle Axiata special URL
    if (operator === 'axiata-lk') {
      checkoutUrl = checkoutUrl.replace('/purchase', '/purchase/axiata');
    }

    // Build query parameters
    const queryParams = {
      merchant: params.merchant,
      service: params.campaign,
      redirect_url: params.redirect_url
    };

    // Add optional parameters
    if (params.correlator || config.requiresCorrelator) {
      queryParams.correlator = params.correlator || this.generateCorrelator();
    }

    if (params.price) {
      queryParams.price = params.price;
    }

    if (params.transaction_id || config.requiresTransactionId) {
      queryParams.transaction_id = params.transaction_id || this.generateTransactionId();
    }

    if (params.language) {
      queryParams.language = params.language;
    }

    const queryString = this.buildQueryString(queryParams);
    return `${checkoutUrl}?${queryString}`;
  }

  // ============= ACR MANAGEMENT (Telenor) =============

  /**
   * Get ACR for subscription
   */
  getACR(uuid) {
    return this.acrMappings.get(uuid);
  }

  /**
   * Store ACR mapping
   */
  storeACR(uuid, acr) {
    this.acrMappings.set(uuid, acr);
  }
}

module.exports = SLAClient;