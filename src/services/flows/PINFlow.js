/**
 * PIN Flow Implementation
 * Standard PIN-based authentication flow for operators
 */

const { apiLogger, operatorLogger } = require('../../utils/logger');
const { operatorConfigs } = require('../../config/operators.config');
const { apiConfig } = require('../../config/api.config');

class PINFlow {
  constructor(slaClient) {
    this.slaClient = slaClient;
    this.activePINs = new Map(); // Store active PINs with expiry
  }

  /**
   * Complete PIN flow for subscription
   */
  async executeSubscriptionFlow(operator, params) {
    const config = operatorConfigs[operator];
    
    if (!this.slaClient.supportsPINAPI(operator)) {
      throw new Error(`PIN flow not supported for ${operator}`);
    }

    operatorLogger.logOperation(operator, 'PIN Flow Started', params);

    try {
      // Step 1: Generate PIN
      const pinResponse = await this.generateAndSendPIN(operator, {
        msisdn: params.msisdn,
        campaign: params.campaign,
        merchant: params.merchant,
        template: params.template || 'subscription',
        language: params.language || 'en',
        ...(config.requiresAmount ? { amount: params.amount } : {})
      });

      if (!pinResponse.success) {
        throw new Error(`PIN generation failed: ${pinResponse.error?.message}`);
      }

      // Store PIN reference with expiry (120 seconds)
      const pinRef = this.storePINReference(params.msisdn, operator);

      return {
        success: true,
        action: 'AWAIT_PIN_ENTRY',
        pinRef,
        expiresIn: 120,
        nextStep: {
          method: 'completeSubscriptionWithPIN',
          requiredParams: ['pin'],
          endpoint: '/complete-subscription'
        }
      };

    } catch (error) {
      operatorLogger.logFailure(operator, 'PIN Flow Failed', error);
      throw error;
    }
  }

  /**
   * Generate and send PIN to MSISDN
   */
  async generateAndSendPIN(operator, params) {
    const config = operatorConfigs[operator];

    // Build PIN request parameters
    const pinParams = {
      msisdn: params.msisdn,
      campaign: params.campaign,
      merchant: params.merchant,
      template: params.template,
      language: params.language
    };

    // Add operator-specific requirements
    
    // Ooredoo Kuwait requires amount
    if (operator === 'ooredoo-kw' && params.amount) {
      pinParams.amount = params.amount;
    }

    // Mobily KSA requires fraud token
    if (operator === 'mobily-sa') {
      if (!params.fraud_token) {
        throw new Error('Fraud token required for Mobily KSA');
      }
      pinParams.fraud_token = params.fraud_token;
    }

    // Handle sandbox environment
    if (this.slaClient.environment === 'sandbox') {
      apiLogger.info('Sandbox mode: PIN will be 000000');
    }

    // Make PIN API call
    const response = await this.slaClient.generatePIN(operator, pinParams);

    // Handle PIN-specific response
    if (response.success) {
      operatorLogger.info(`PIN sent to ${params.msisdn} for ${operator}`);
      
      // Store PIN metadata
      this.storePINMetadata(params.msisdn, operator, {
        sentAt: Date.now(),
        expiresAt: Date.now() + (120 * 1000), // 120 seconds
        attempts: 0
      });
    }

    return response;
  }

  /**
   * Complete subscription with PIN
   */
  async completeSubscriptionWithPIN(operator, params) {
    const config = operatorConfigs[operator];

    // Validate PIN expiry
    const pinMeta = this.getPINMetadata(params.msisdn, operator);
    if (!pinMeta) {
      throw new Error('No PIN request found. Please generate a new PIN.');
    }

    if (Date.now() > pinMeta.expiresAt) {
      this.clearPINMetadata(params.msisdn, operator);
      throw new Error('PIN expired. Please generate a new PIN.');
    }

    // Increment attempt counter
    pinMeta.attempts++;
    
    if (pinMeta.attempts > 3) {
      this.clearPINMetadata(params.msisdn, operator);
      throw new Error('Maximum PIN attempts exceeded. Please generate a new PIN.');
    }

    try {
      // Create subscription with PIN
      const subscriptionParams = {
        msisdn: params.msisdn,
        pin: params.pin,
        campaign: params.campaign,
        merchant: params.merchant,
        language: params.language || 'en'
      };

      // Add optional parameters
      if (params.trial) {
        subscriptionParams.trial = params.trial;
      }

      if (params.trial_once !== undefined) {
        subscriptionParams.trial_once = params.trial_once;
      }

      // Mobily KSA requires fraud token even for subscription create
      if (operator === 'mobily-sa' && params.fraud_token) {
        subscriptionParams.fraud_token = params.fraud_token;
      }

      const response = await this.slaClient.createSubscription(operator, subscriptionParams);

      if (response.success) {
        // Clear PIN metadata on success
        this.clearPINMetadata(params.msisdn, operator);

        // Send welcome SMS if supported
        if (!config.noSMS) {
          await this.sendWelcomeSMS(operator, {
            msisdn: params.msisdn,
            campaign: params.campaign,
            merchant: params.merchant,
            subscriptionId: response.data.uuid
          });
        }

        return response;
      }

      return response;

    } catch (error) {
      // Update PIN metadata with failed attempt
      this.updatePINMetadata(params.msisdn, operator, pinMeta);
      throw error;
    }
  }

  /**
   * Execute one-off charge with PIN
   */
  async executeChargeFlow(operator, params) {
    const config = operatorConfigs[operator];

    if (!this.slaClient.supportsPINAPI(operator)) {
      throw new Error(`PIN flow not supported for ${operator}`);
    }

    // Step 1: Generate PIN for charge
    const pinResponse = await this.generateAndSendPIN(operator, {
      msisdn: params.msisdn,
      campaign: params.campaign,
      merchant: params.merchant,
      template: 'charge',
      language: params.language || 'en',
      amount: params.amount // Amount is required for charge
    });

    if (!pinResponse.success) {
      throw new Error(`PIN generation failed: ${pinResponse.error?.message}`);
    }

    // Store PIN reference
    const pinRef = this.storePINReference(params.msisdn, operator);

    return {
      success: true,
      action: 'AWAIT_PIN_ENTRY',
      pinRef,
      expiresIn: 120,
      nextStep: {
        method: 'completeChargeWithPIN',
        requiredParams: ['pin', 'amount', 'currency'],
        endpoint: '/complete-charge'
      }
    };
  }

  /**
   * Complete charge with PIN
   */
  async completeChargeWithPIN(operator, params) {
    // Validate PIN expiry
    const pinMeta = this.getPINMetadata(params.msisdn, operator);
    if (!pinMeta || Date.now() > pinMeta.expiresAt) {
      throw new Error('PIN expired or not found');
    }

    try {
      const chargeParams = {
        msisdn: params.msisdn,
        pin: params.pin,
        campaign: params.campaign,
        merchant: params.merchant,
        amount: params.amount,
        currency: params.currency,
        language: params.language || 'en'
      };

      const response = await this.slaClient.charge(operator, chargeParams);

      if (response.success) {
        this.clearPINMetadata(params.msisdn, operator);
      }

      return response;

    } catch (error) {
      throw error;
    }
  }

  /**
   * Send welcome SMS after successful subscription
   */
  async sendWelcomeSMS(operator, params) {
    const config = operatorConfigs[operator];

    if (config.noSMS) {
      operatorLogger.info(`SMS not supported for ${operator}, skipping welcome SMS`);
      return;
    }

    try {
      const smsParams = {
        msisdn: params.msisdn,
        campaign: params.campaign,
        merchant: params.merchant,
        text: params.text || 'welcome',
        correlator: this.slaClient.generateCorrelator()
      };

      // Handle Mobily dynamic SMS
      if (operator === 'mobily-sa' && params.serviceUrl) {
        smsParams.text = params.serviceUrl;
        smsParams.dynamic_sms = true;
      }

      const response = await this.slaClient.sendSMS(operator, smsParams);
      
      if (response.success) {
        operatorLogger.info(`Welcome SMS sent for ${operator} to ${params.msisdn}`);
      } else {
        operatorLogger.warn(`Welcome SMS failed for ${operator}: ${response.error?.message}`);
      }

      return response;

    } catch (error) {
      operatorLogger.error(`Welcome SMS error for ${operator}:`, error);
      // Don't throw - SMS failure shouldn't fail the subscription
      return { success: false, error };
    }
  }

  // ============= PIN METADATA MANAGEMENT =============

  storePINReference(msisdn, operator) {
    const ref = `PIN_${operator}_${msisdn}_${Date.now()}`;
    return ref;
  }

  storePINMetadata(msisdn, operator, metadata) {
    const key = `${operator}_${msisdn}`;
    this.activePINs.set(key, metadata);
  }

  getPINMetadata(msisdn, operator) {
    const key = `${operator}_${msisdn}`;
    return this.activePINs.get(key);
  }

  updatePINMetadata(msisdn, operator, metadata) {
    const key = `${operator}_${msisdn}`;
    this.activePINs.set(key, metadata);
  }

  clearPINMetadata(msisdn, operator) {
    const key = `${operator}_${msisdn}`;
    this.activePINs.delete(key);
  }

  /**
   * Clean up expired PINs
   */
  cleanupExpiredPINs() {
    const now = Date.now();
    for (const [key, metadata] of this.activePINs.entries()) {
      if (metadata.expiresAt < now) {
        this.activePINs.delete(key);
        operatorLogger.debug(`Cleaned up expired PIN: ${key}`);
      }
    }
  }
}

// Set up periodic cleanup (every 60 seconds)
setInterval(() => {
  // This will be called when an instance is created
}, 60000);

module.exports = PINFlow;