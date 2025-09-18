/**
 * SLA Digital API Integration
 * Main entry point for the integration library
 */

require('dotenv').config();

const SLAClient = require('./services/core/SLAClient');
const ResponseHandler = require('./services/core/ResponseHandler');
const { operatorConfigs, getOperatorsByCountry, getOperatorsByFlow, supportsPINAPI } = require('./config/operators.config');
const { apiConfig, getEndpointUrl, getCheckoutUrl } = require('./config/api.config');
const { systemLogger, operatorLogger } = require('./utils/logger');

/**
 * Main SLA Digital Integration Class
 */
class SLADigitalIntegration {
  constructor(environment = 'sandbox', options = {}) {
    this.environment = environment;
    this.options = options;
    
    // Initialize components
    this.client = new SLAClient(environment, options.credentials);
    this.responseHandler = new ResponseHandler();
    
    // Log initialization
    systemLogger.logStartup({
      environment,
      version: '1.0.0',
      operators: Object.keys(operatorConfigs).length
    });
  }

  // ============= SUBSCRIPTION MANAGEMENT =============

  /**
   * Create a subscription for an operator
   */
  async createSubscription(operator, params) {
    operatorLogger.logOperation(operator, 'createSubscription', params);
    
    try {
      const response = await this.client.createSubscription(operator, params);
      const processed = this.responseHandler.processResponse(response, operator, 'subscription');
      
      operatorLogger.logSuccess(operator, 'createSubscription', processed);
      return processed;
    } catch (error) {
      operatorLogger.logFailure(operator, 'createSubscription', error);
      throw error;
    }
  }

  /**
   * Delete a subscription
   */
  async deleteSubscription(operator, params) {
    operatorLogger.logOperation(operator, 'deleteSubscription', params);
    
    try {
      const response = await this.client.deleteSubscription(operator, params);
      const processed = this.responseHandler.processResponse(response, operator, 'deletion');
      
      operatorLogger.logSuccess(operator, 'deleteSubscription', processed);
      return processed;
    } catch (error) {
      operatorLogger.logFailure(operator, 'deleteSubscription', error);
      throw error;
    }
  }

  /**
   * Get subscription status
   */
  async getSubscriptionStatus(operator, params) {
    operatorLogger.logOperation(operator, 'getSubscriptionStatus', params);
    
    try {
      const response = await this.client.getSubscriptionStatus(operator, params);
      const processed = this.responseHandler.processResponse(response, operator, 'status');
      
      operatorLogger.logSuccess(operator, 'getSubscriptionStatus', processed);
      return processed;
    } catch (error) {
      operatorLogger.logFailure(operator, 'getSubscriptionStatus', error);
      throw error;
    }
  }

  // ============= BILLING =============

  /**
   * One-off charge
   */
  async charge(operator, params) {
    operatorLogger.logOperation(operator, 'charge', params);
    
    try {
      const response = await this.client.charge(operator, params);
      const processed = this.responseHandler.processResponse(response, operator, 'charge');
      
      operatorLogger.logSuccess(operator, 'charge', processed);
      return processed;
    } catch (error) {
      operatorLogger.logFailure(operator, 'charge', error);
      throw error;
    }
  }

  // ============= PIN MANAGEMENT =============

  /**
   * Generate PIN for operator
   */
  async generatePIN(operator, params) {
    operatorLogger.logOperation(operator, 'generatePIN', params);
    
    try {
      const response = await this.client.generatePIN(operator, params);
      const processed = this.responseHandler.processResponse(response, operator, 'pin');
      
      operatorLogger.logSuccess(operator, 'generatePIN', processed);
      return processed;
    } catch (error) {
      operatorLogger.logFailure(operator, 'generatePIN', error);
      throw error;
    }
  }

  // ============= SMS =============

  /**
   * Send SMS
   */
  async sendSMS(operator, params) {
    operatorLogger.logOperation(operator, 'sendSMS', params);
    
    try {
      const response = await this.client.sendSMS(operator, params);
      const processed = this.responseHandler.processResponse(response, operator, 'sms');
      
      operatorLogger.logSuccess(operator, 'sendSMS', processed);
      return processed;
    } catch (error) {
      operatorLogger.logFailure(operator, 'sendSMS', error);
      throw error;
    }
  }

  // ============= CHECKOUT =============

  /**
   * Get checkout URL for operator
   */
  getCheckoutUrl(operator, params) {
    return this.client.buildCheckoutUrl(operator, params);
  }

  // ============= WEBHOOK PROCESSING =============

  /**
   * Process webhook notification
   */
  processWebhook(notification) {
    return this.responseHandler.processWebhookNotification(notification);
  }

  // ============= UTILITY METHODS =============

  /**
   * Get operator configuration
   */
  getOperatorConfig(operator) {
    return operatorConfigs[operator];
  }

  /**
   * Check if operator supports PIN API
   */
  supportsPINAPI(operator) {
    return this.client.supportsPINAPI(operator);
  }

  /**
   * Get all operators by country
   */
  getOperatorsByCountry(country) {
    return getOperatorsByCountry(country);
  }

  /**
   * Get all operators by flow type
   */
  getOperatorsByFlow(flowType) {
    return getOperatorsByFlow(flowType);
  }

  /**
   * Get all supported operators
   */
  getSupportedOperators() {
    return Object.keys(operatorConfigs);
  }

  /**
   * Get environment info
   */
  getEnvironmentInfo() {
    return {
      current: this.environment,
      available: Object.keys(apiConfig.environments),
      config: apiConfig.environments[this.environment]
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    const health = {
      status: 'OK',
      environment: this.environment,
      operators: Object.keys(operatorConfigs).length,
      timestamp: new Date().toISOString()
    };

    systemLogger.logHealthCheck(health);
    return health;
  }
}

// Export main class and utilities
module.exports = {
  SLADigitalIntegration,
  SLAClient,
  ResponseHandler,
  operatorConfigs,
  apiConfig,
  
  // Helper functions
  getOperatorsByCountry,
  getOperatorsByFlow,
  supportsPINAPI,
  getEndpointUrl,
  getCheckoutUrl,
  
  // Create default instance
  createInstance: (environment = 'sandbox', options = {}) => {
    return new SLADigitalIntegration(environment, options);
  }
};

// Handle process termination
process.on('SIGINT', () => {
  systemLogger.logShutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  systemLogger.logShutdown();
  process.exit(0);
});