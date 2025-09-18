/**
 * Checkout Flow Implementation
 * Manages checkout-based subscription and payment flows
 */

const { apiLogger, operatorLogger } = require('../../utils/logger');
const { operatorConfigs } = require('../../config/operators.config');
const { apiConfig } = require('../../config/api.config');

class CheckoutFlow {
  constructor(slaClient) {
    this.slaClient = slaClient;
    this.pendingCheckouts = new Map(); // Track pending checkout sessions
  }

  /**
   * Execute checkout flow for subscription
   */
  async executeSubscriptionCheckout(operator, params) {
    const config = operatorConfigs[operator];

    operatorLogger.logOperation(operator, 'Checkout Flow Started', params);

    // Validate flow support
    if (!this.supportsCheckout(operator)) {
      throw new Error(`Checkout flow not supported for ${operator}`);
    }

    // Handle special cases

    // UK Operators - async flow
    if (this.isUKOperator(operator)) {
      return this.executeUKCheckout(operator, params);
    }

    // Etisalat UAE - no landing page allowed
    if (operator === 'etisalat-ae') {
      return this.executeDirectCheckout(operator, params);
    }

    // Axiata - async with transaction ID
    if (operator === 'axiata-lk') {
      return this.executeAxiataCheckout(operator, params);
    }

    // Telenor - ACR handling
    if (config.usesACR) {
      return this.executeACRCheckout(operator, params);
    }

    // Standard checkout flow
    return this.executeStandardCheckout(operator, params);
  }

  /**
   * Standard checkout flow
   */
  async executeStandardCheckout(operator, params) {
    const config = operatorConfigs[operator];

    // Build checkout URL
    const checkoutUrl = this.slaClient.buildCheckoutUrl(operator, {
      merchant: params.merchant,
      campaign: params.campaign,
      redirect_url: params.redirect_url,
      price: params.price,
      language: params.language
    });

    // Create checkout session
    const sessionId = this.createCheckoutSession(operator, params);

    return {
      success: true,
      action: 'REDIRECT_TO_CHECKOUT',
      checkoutUrl,
      sessionId,
      flow: 'standard',
      expectedCallback: {
        success: {
          params: ['status', 'token', 'correlator'],
          tokenValidity: 120
        },
        failure: {
          params: ['status', 'error']
        }
      },
      nextStep: {
        method: 'completeCheckoutSubscription',
        endpoint: '/complete-checkout'
      }
    };
  }

  /**
   * UK operators checkout (async)
   */
  async executeUKCheckout(operator, params) {
    const config = operatorConfigs[operator];

    // UK requires correlator
    if (!params.correlator) {
      params.correlator = this.slaClient.generateCorrelator();
    }

    const checkoutUrl = this.slaClient.buildCheckoutUrl(operator, {
      merchant: params.merchant,
      service: params.campaign, // Note: UK uses 'service' not 'campaign'
      redirect_url: params.redirect_url,
      correlator: params.correlator
    });

    const sessionId = this.createCheckoutSession(operator, params);

    return {
      success: true,
      action: 'REDIRECT_TO_CHECKOUT',
      checkoutUrl,
      sessionId,
      flow: 'uk_async',
      correlator: params.correlator,
      important: 'DO NOT call subscription/create API. Wait for webhook notification.',
      expectedCallback: {
        immediate: {
          status: 'pending',
          params: ['status', 'msisdn', 'correlator']
        },
        webhook: {
          type: 'subscription',
          expectedTime: '2-5 minutes',
          params: ['uuid', 'msisdn', 'status']
        }
      }
    };
  }

  /**
   * Etisalat UAE direct checkout (no landing page)
   */
  async executeDirectCheckout(operator, params) {
    // Etisalat requires immediate redirect to checkout
    const checkoutUrl = this.slaClient.buildCheckoutUrl(operator, {
      merchant: params.merchant,
      campaign: params.campaign,
      redirect_url: params.redirect_url,
      price: params.price,
      language: params.language || 'en'
    });

    return {
      success: true,
      action: 'IMMEDIATE_REDIRECT',
      checkoutUrl,
      flow: 'etisalat_direct',
      warning: 'No landing page allowed. Redirect immediately to checkout.',
      expectedCallback: {
        success: {
          params: ['status', 'token'],
          tokenValidity: 120
        }
      }
    };
  }

  /**
   * Axiata checkout (async with transaction ID)
   */
  async executeAxiataCheckout(operator, params) {
    // Axiata requires transaction ID
    if (!params.transaction_id) {
      params.transaction_id = this.slaClient.generateTransactionId();
    }

    const checkoutUrl = this.slaClient.buildCheckoutUrl(operator, {
      merchant: params.merchant,
      service: params.campaign,
      transaction_id: params.transaction_id,
      redirect_url: params.redirect_url,
      price: params.price
    });

    const sessionId = this.createCheckoutSession(operator, {
      ...params,
      transaction_id: params.transaction_id
    });

    return {
      success: true,
      action: 'REDIRECT_TO_CHECKOUT',
      checkoutUrl,
      sessionId,
      transaction_id: params.transaction_id,
      flow: 'axiata_async',
      warning: 'Response will be asynchronous. Wait for notification.',
      expectedCallback: {
        redirect: {
          success: ['status', 'transaction_id', 'uuid'],
          failure: ['status', 'error']
        },
        notification: {
          async: true,
          params: ['uuid', 'status', 'transaction']
        }
      }
    };
  }

  /**
   * Telenor ACR checkout
   */
  async executeACRCheckout(operator, params) {
    // Telenor requires correlator
    if (!params.correlator) {
      params.correlator = this.slaClient.generateCorrelator();
    }

    const checkoutUrl = this.slaClient.buildCheckoutUrl(operator, {
      merchant: params.merchant,
      service: params.campaign,
      redirect_url: params.redirect_url,
      correlator: params.correlator,
      price: params.price,
      language: params.language
    });

    const sessionId = this.createCheckoutSession(operator, params);

    return {
      success: true,
      action: 'REDIRECT_TO_CHECKOUT',
      checkoutUrl,
      sessionId,
      correlator: params.correlator,
      flow: 'telenor_acr',
      note: 'ACR will be returned instead of MSISDN',
      expectedCallback: {
        success: {
          params: ['status', 'token', 'correlator'],
          tokenValidity: 120
        }
      },
      nextStep: {
        method: 'completeACRCheckout',
        note: 'Use token to create subscription, ACR will be in response'
      }
    };
  }

  /**
   * Complete checkout subscription with token
   */
  async completeCheckoutSubscription(operator, token, sessionParams) {
    const config = operatorConfigs[operator];

    // Validate token format
    if (!token.startsWith('TOKEN:')) {
      token = `TOKEN:${token}`;
    }

    // Get session data
    const session = this.getCheckoutSession(sessionParams.sessionId);
    if (!session) {
      throw new Error('Checkout session not found or expired');
    }

    try {
      // Create subscription with token
      const subscriptionParams = {
        msisdn: token,
        campaign: session.campaign,
        merchant: session.merchant,
        language: session.language || 'en'
      };

      // Add trial parameters if present
      if (session.trial) {
        subscriptionParams.trial = session.trial;
      }

      const response = await this.slaClient.createSubscription(operator, subscriptionParams);

      if (response.success) {
        // Clear session
        this.clearCheckoutSession(sessionParams.sessionId);

        // Handle ACR storage for Telenor
        if (config.usesACR && response.data.msisdn?.startsWith('telenor-')) {
          this.slaClient.storeACR(response.data.uuid, response.data.msisdn);
          response.acrStored = true;
        }

        // Send welcome SMS if supported
        if (!config.noSMS) {
          await this.sendWelcomeSMS(operator, {
            msisdn: response.data.msisdn,
            campaign: session.campaign,
            merchant: session.merchant,
            uuid: response.data.uuid
          });
        }
      }

      return response;

    } catch (error) {
      operatorLogger.logFailure(operator, 'Checkout completion failed', error);
      throw error;
    }
  }

  /**
   * Complete one-off charge checkout
   */
  async completeCheckoutCharge(operator, token, sessionParams) {
    // Validate token
    if (!token.startsWith('TOKEN:')) {
      token = `TOKEN:${token}`;
    }

    const session = this.getCheckoutSession(sessionParams.sessionId);
    if (!session) {
      throw new Error('Checkout session not found or expired');
    }

    try {
      const chargeParams = {
        msisdn: token,
        campaign: session.campaign,
        merchant: session.merchant,
        amount: session.amount,
        currency: session.currency,
        language: session.language || 'en'
      };

      const response = await this.slaClient.charge(operator, chargeParams);

      if (response.success) {
        this.clearCheckoutSession(sessionParams.sessionId);
      }

      return response;

    } catch (error) {
      operatorLogger.logFailure(operator, 'Checkout charge failed', error);
      throw error;
    }
  }

  /**
   * Send welcome SMS
   */
  async sendWelcomeSMS(operator, params) {
    const config = operatorConfigs[operator];

    if (config.noSMS) {
      return { skipped: true, reason: 'SMS not supported' };
    }

    try {
      const smsParams = {
        msisdn: params.msisdn,
        campaign: params.campaign,
        merchant: params.merchant,
        text: 'welcome',
        correlator: this.slaClient.generateCorrelator()
      };

      return await this.slaClient.sendSMS(operator, smsParams);
    } catch (error) {
      // Don't fail subscription on SMS error
      operatorLogger.warn(`Welcome SMS failed for ${operator}:`, error);
      return { success: false, error };
    }
  }

  // ============= CHECKOUT SESSION MANAGEMENT =============

  createCheckoutSession(operator, params) {
    const sessionId = `CHECKOUT_${operator}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const session = {
      sessionId,
      operator,
      ...params,
      createdAt: Date.now(),
      expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes
    };

    this.pendingCheckouts.set(sessionId, session);
    
    // Set auto-cleanup
    setTimeout(() => {
      if (this.pendingCheckouts.has(sessionId)) {
        this.pendingCheckouts.delete(sessionId);
        operatorLogger.debug(`Checkout session expired: ${sessionId}`);
      }
    }, 10 * 60 * 1000);

    return sessionId;
  }

  getCheckoutSession(sessionId) {
    return this.pendingCheckouts.get(sessionId);
  }

  clearCheckoutSession(sessionId) {
    this.pendingCheckouts.delete(sessionId);
  }

  // ============= HELPER METHODS =============

  supportsCheckout(operator) {
    const config = operatorConfigs[operator];
    return config && (
      config.flow === 'checkout' ||
      config.flow === 'checkout_only' ||
      config.flow === 'checkout_async' ||
      config.flow === 'checkout_with_acr' ||
      config.flow === 'checkout_or_pin' ||
      config.flow === 'checkout_or_api'
    );
  }

  isUKOperator(operator) {
    return ['vodafone-uk', 'three-uk', 'o2-uk', 'ee-uk'].includes(operator);
  }

  isAsyncOperator(operator) {
    const config = operatorConfigs[operator];
    return config && (config.asyncResponse === true || config.webhookBased === true);
  }
}

module.exports = CheckoutFlow;