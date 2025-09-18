/**
 * Flow Manager
 * Orchestrates different payment flows based on operator requirements
 */

const PINFlow = require('./PINFlow');
const CheckoutFlow = require('./CheckoutFlow');
const { operatorConfigs } = require('../../config/operators.config');
const { operatorLogger } = require('../../utils/logger');

class FlowManager {
  constructor(slaClient) {
    this.slaClient = slaClient;
    
    // Initialize flow handlers
    this.pinFlow = new PINFlow(slaClient);
    this.checkoutFlow = new CheckoutFlow(slaClient);
    
    // Track active flows
    this.activeFlows = new Map();
  }

  /**
   * Initiate subscription based on operator flow
   */
  async initiateSubscription(operator, params) {
    const config = operatorConfigs[operator];
    
    if (!config) {
      throw new Error(`Unknown operator: ${operator}`);
    }

    operatorLogger.logOperation(operator, 'Initiating subscription', {
      flow: config.flow,
      params
    });

    // Determine and execute appropriate flow
    switch (config.flow) {
      case 'checkout_only':
        return this.handleCheckoutOnly(operator, params);
        
      case 'checkout_with_acr':
        return this.handleCheckoutWithACR(operator, params);
        
      case 'pin_api_allowed':
        return this.handlePINAllowed(operator, params);
        
      case 'pin_with_fraud_prevention':
        return this.handleFraudPreventionFlow(operator, params);
        
      case 'checkout_async':
        return this.handleAsyncCheckout(operator, params);
        
      case 'checkout_or_pin':
        return this.handleCheckoutOrPIN(operator, params);
        
      case 'checkout_or_api':
        return this.handleCheckoutOrAPI(operator, params);
        
      case 'checkout':
      default:
        return this.handleStandardCheckout(operator, params);
    }
  }

  /**
   * Initiate one-off charge based on operator flow
   */
  async initiateCharge(operator, params) {
    const config = operatorConfigs[operator];
    
    if (!config) {
      throw new Error(`Unknown operator: ${operator}`);
    }

    operatorLogger.logOperation(operator, 'Initiating charge', {
      flow: config.flow,
      params
    });

    // Check if operator supports one-off charges
    if (config.noChargeAPI) {
      throw new Error(`One-off charges not supported for ${operator}`);
    }

    // Route to appropriate flow
    if (this.supportsPIN(operator) && params.preferPIN) {
      return this.pinFlow.executeChargeFlow(operator, params);
    } else if (this.supportsCheckout(operator)) {
      return this.checkoutFlow.executeCheckoutCharge(operator, params);
    } else {
      throw new Error(`No charge flow available for ${operator}`);
    }
  }

  // ============= FLOW HANDLERS =============

  /**
   * Handle checkout-only operators
   */
  async handleCheckoutOnly(operator, params) {
    const config = operatorConfigs[operator];
    
    // UK operators
    if (['vodafone-uk', 'three-uk', 'o2-uk', 'ee-uk'].includes(operator)) {
      // UK operators have special async handling
      const result = await this.checkoutFlow.executeUKCheckout(operator, params);
      
      // Store flow reference for webhook handling
      this.storeFlowReference(operator, result.correlator, {
        type: 'uk_async',
        sessionId: result.sessionId,
        expectingWebhook: true
      });
      
      return result;
    }
    
    // Zain operators
    if (operator.startsWith('zain-')) {
      // Zain uses special checkout URL
      return this.checkoutFlow.executeSubscriptionCheckout(operator, params);
    }
    
    // Etisalat UAE
    if (operator === 'etisalat-ae') {
      // Direct checkout, no landing page
      return this.checkoutFlow.executeDirectCheckout(operator, params);
    }
    
    // STC Kuwait
    if (operator === 'stc-kw') {
      return this.checkoutFlow.executeStandardCheckout(operator, params);
    }
    
    // Default checkout-only
    return this.checkoutFlow.executeSubscriptionCheckout(operator, params);
  }

  /**
   * Handle checkout with ACR (Telenor)
   */
  async handleCheckoutWithACR(operator, params) {
    const result = await this.checkoutFlow.executeACRCheckout(operator, params);
    
    // Store flow reference for ACR tracking
    this.storeFlowReference(operator, result.correlator, {
      type: 'acr_checkout',
      sessionId: result.sessionId,
      expectingACR: true
    });
    
    return result;
  }

  /**
   * Handle PIN API allowed operators
   */
  async handlePINAllowed(operator, params) {
    // These operators support PIN API
    if (params.preferCheckout && this.supportsCheckout(operator)) {
      return this.checkoutFlow.executeSubscriptionCheckout(operator, params);
    }
    
    return this.pinFlow.executeSubscriptionFlow(operator, params);
  }

  /**
   * Handle fraud prevention flow (Mobily KSA)
   */
  async handleFraudPreventionFlow(operator, params) {
    if (!params.fraud_token) {
      return {
        success: false,
        action: 'LOAD_FRAUD_SCRIPT',
        fraudScriptRequired: true,
        nextStep: {
          method: 'initiateWithFraudToken',
          requiredParams: ['fraud_token']
        }
      };
    }
    
    // Execute PIN flow with fraud token
    return this.pinFlow.executeSubscriptionFlow(operator, params);
  }

  /**
   * Handle async checkout (Axiata)
   */
  async handleAsyncCheckout(operator, params) {
    const result = await this.checkoutFlow.executeAxiataCheckout(operator, params);
    
    // Store flow reference for async handling
    this.storeFlowReference(operator, result.transaction_id, {
      type: 'axiata_async',
      sessionId: result.sessionId,
      expectingNotification: true
    });
    
    return result;
  }

  /**
   * Handle checkout or PIN (Ooredoo Kuwait)
   */
  async handleCheckoutOrPIN(operator, params) {
    // User preference or default to checkout
    if (params.useCheckout !== false) {
      return this.checkoutFlow.executeSubscriptionCheckout(operator, params);
    }
    
    // Use PIN flow (requires amount for Ooredoo)
    if (!params.amount) {
      throw new Error('Amount is required for Ooredoo Kuwait PIN flow');
    }
    
    return this.pinFlow.executeSubscriptionFlow(operator, params);
  }

  /**
   * Handle checkout or API (U Mobile, Telenor Digi)
   */
  async handleCheckoutOrAPI(operator, params) {
    // Default to checkout for better user experience
    if (params.useCheckout !== false) {
      return this.checkoutFlow.executeSubscriptionCheckout(operator, params);
    }
    
    // Use PIN API flow
    return this.pinFlow.executeSubscriptionFlow(operator, params);
  }

  /**
   * Handle standard checkout flow
   */
  async handleStandardCheckout(operator, params) {
    return this.checkoutFlow.executeSubscriptionCheckout(operator, params);
  }

  // ============= FLOW COMPLETION HANDLERS =============

  /**
   * Complete flow with token from checkout
   */
  async completeWithToken(operator, token, sessionData) {
    const flowRef = this.getFlowReference(operator, sessionData.correlator || sessionData.sessionId);
    
    if (!flowRef) {
      throw new Error('No active flow found for this session');
    }
    
    switch (flowRef.type) {
      case 'acr_checkout':
        // Handle ACR response
        const result = await this.checkoutFlow.completeCheckoutSubscription(operator, token, sessionData);
        if (result.data?.msisdn?.startsWith('telenor-')) {
          result.acr = result.data.msisdn;
          result.acrStored = true;
        }
        return result;
        
      case 'standard_checkout':
        return this.checkoutFlow.completeCheckoutSubscription(operator, token, sessionData);
        
      default:
        return this.checkoutFlow.completeCheckoutSubscription(operator, token, sessionData);
    }
  }

  /**
   * Complete flow with PIN
   */
  async completeWithPIN(operator, params) {
    return this.pinFlow.completeSubscriptionWithPIN(operator, params);
  }

  /**
   * Handle webhook notification
   */
  async handleWebhookNotification(operator, notification) {
    const config = operatorConfigs[operator];
    
    // UK operators
    if (['vodafone-uk', 'three-uk', 'o2-uk', 'ee-uk'].includes(operator)) {
      // UK operators create subscription via webhook
      if (notification.success?.type === 'subscription') {
        operatorLogger.info(`UK operator subscription created via webhook: ${operator}`);
        return {
          success: true,
          subscriptionCreated: true,
          data: notification.success
        };
      }
    }
    
    // Zain status changes
    if (operator.startsWith('zain-') && notification.success?.transaction?.status === 'SUSPENDED') {
      operatorLogger.info(`Zain subscription suspended: ${operator}`);
      return {
        success: true,
        action: 'SUBSCRIPTION_SUSPENDED',
        data: notification.success
      };
    }
    
    // Axiata async response
    if (operator === 'axiata-lk') {
      const flowRef = this.getFlowReference(operator, notification.success?.transaction_id);
      if (flowRef && flowRef.expectingNotification) {
        return {
          success: true,
          asyncComplete: true,
          data: notification.success
        };
      }
    }
    
    // Standard webhook handling
    return {
      success: true,
      webhookProcessed: true,
      data: notification.success || notification.error
    };
  }

  // ============= HELPER METHODS =============

  supportsPIN(operator) {
    return this.slaClient.supportsPINAPI(operator);
  }

  supportsCheckout(operator) {
    const config = operatorConfigs[operator];
    return config && (
      config.flow?.includes('checkout') ||
      config.flow === 'checkout_or_pin' ||
      config.flow === 'checkout_or_api'
    );
  }

  storeFlowReference(operator, key, data) {
    const refKey = `${operator}_${key}`;
    this.activeFlows.set(refKey, {
      ...data,
      operator,
      createdAt: Date.now(),
      expiresAt: Date.now() + (30 * 60 * 1000) // 30 minutes
    });
    
    // Auto-cleanup
    setTimeout(() => {
      this.activeFlows.delete(refKey);
    }, 30 * 60 * 1000);
  }

  getFlowReference(operator, key) {
    const refKey = `${operator}_${key}`;
    return this.activeFlows.get(refKey);
  }

  clearFlowReference(operator, key) {
    const refKey = `${operator}_${key}`;
    this.activeFlows.delete(refKey);
  }

  /**
   * Get recommended flow for operator
   */
  getRecommendedFlow(operator) {
    const config = operatorConfigs[operator];
    
    if (!config) {
      return null;
    }
    
    // Recommendations based on user experience
    const recommendations = {
      'checkout_only': 'checkout',
      'checkout_with_acr': 'checkout',
      'pin_api_allowed': 'pin', // PIN for these operators as checkout may not be available
      'pin_with_fraud_prevention': 'pin_with_fraud',
      'checkout_async': 'checkout',
      'checkout_or_pin': 'checkout',
      'checkout_or_api': 'checkout',
      'checkout': 'checkout'
    };
    
    return recommendations[config.flow] || 'checkout';
  }
}

module.exports = FlowManager;