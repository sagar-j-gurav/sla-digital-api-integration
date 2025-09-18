/**
 * Webhook Handler
 * Processes webhook notifications from SLA Digital
 */

const express = require('express');
const { webhookLogger } = require('../../utils/logger');
const { operatorConfigs } = require('../../config/operators.config');

class WebhookHandler {
  constructor(responseHandler, flowManager) {
    this.responseHandler = responseHandler;
    this.flowManager = flowManager;
    this.webhookCallbacks = new Map();
    this.webhookHistory = [];
  }

  /**
   * Create Express router for webhook endpoints
   */
  createRouter() {
    const router = express.Router();

    // Main webhook endpoint
    router.post('/webhook', this.handleWebhook.bind(this));
    
    // Operator-specific webhook endpoints (if needed)
    router.post('/webhook/:operator', this.handleOperatorWebhook.bind(this));
    
    // Status endpoint for monitoring
    router.get('/webhook/status', this.getWebhookStatus.bind(this));
    
    // History endpoint for debugging
    router.get('/webhook/history', this.getWebhookHistory.bind(this));

    return router;
  }

  /**
   * Main webhook handler
   */
  async handleWebhook(req, res) {
    const notification = req.body;
    
    try {
      webhookLogger.logReceived('unknown', 'notification', notification);
      
      // Extract operator from notification
      const operator = this.extractOperator(notification);
      
      if (!operator) {
        webhookLogger.error('unknown', new Error('Could not identify operator from webhook'));
        return res.status(400).json({ error: 'Operator not identified' });
      }
      
      // Process webhook
      const result = await this.processWebhook(operator, notification);
      
      // Send success response
      res.status(200).json({ success: true, processed: true });
      
      // Store in history
      this.storeWebhookHistory(operator, notification, result);
      
    } catch (error) {
      webhookLogger.error('webhook', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Operator-specific webhook handler
   */
  async handleOperatorWebhook(req, res) {
    const { operator } = req.params;
    const notification = req.body;
    
    try {
      webhookLogger.logReceived(operator, 'notification', notification);
      
      // Validate operator
      if (!operatorConfigs[operator]) {
        return res.status(400).json({ error: 'Unknown operator' });
      }
      
      // Process webhook
      const result = await this.processWebhook(operator, notification);
      
      res.status(200).json({ success: true, processed: true });
      
      // Store in history
      this.storeWebhookHistory(operator, notification, result);
      
    } catch (error) {
      webhookLogger.error(operator, error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Process webhook notification
   */
  async processWebhook(operator, notification) {
    const config = operatorConfigs[operator];
    
    // Process with response handler
    const processed = this.responseHandler.processWebhookNotification(notification);
    
    webhookLogger.logProcessed(operator, processed.type, processed);
    
    // Handle different notification types
    const type = notification.success?.type || notification.error?.type;
    const status = notification.success?.transaction?.status || notification.error?.transaction?.status;
    
    // Handle UK operators subscription creation
    if (this.isUKOperator(operator) && type === 'subscription' && notification.success) {
      await this.handleUKSubscriptionCreated(operator, notification);
    }
    
    // Handle Zain status notifications
    if (operator.startsWith('zain-') && status === 'SUSPENDED') {
      await this.handleZainSuspension(operator, notification);
    }
    
    // Handle Axiata async completion
    if (operator === 'axiata-lk' && notification.success) {
      await this.handleAxiataAsyncCompletion(operator, notification);
    }
    
    // Handle subscription renewals
    if (type === 'subscription' && status === 'CHARGED' && notification.success?.mode === 'RENEWAL') {
      await this.handleSubscriptionRenewal(operator, notification);
    }
    
    // Handle failures
    if (status === 'INSUFFICIENT_FUNDS' || status === 'FAILED') {
      await this.handlePaymentFailure(operator, notification);
    }
    
    // Handle deletions
    if (status === 'DELETED' || status === 'REMOVED') {
      await this.handleSubscriptionDeletion(operator, notification);
    }
    
    // Execute registered callbacks
    await this.executeCallbacks(operator, type, notification);
    
    return processed;
  }

  // ============= SPECIFIC HANDLERS =============

  /**
   * Handle UK operator subscription creation
   */
  async handleUKSubscriptionCreated(operator, notification) {
    webhookLogger.info(`UK subscription created via webhook: ${operator}`);
    
    // UK operators create subscriptions asynchronously
    const subscriptionData = notification.success;
    
    // Check if we have a pending flow
    const flowRef = this.flowManager.getFlowReference(operator, subscriptionData.correlator);
    
    if (flowRef) {
      // Update flow status
      flowRef.subscriptionCreated = true;
      flowRef.uuid = subscriptionData.uuid;
      flowRef.msisdn = subscriptionData.msisdn;
      
      // Clear flow reference
      this.flowManager.clearFlowReference(operator, subscriptionData.correlator);
    }
    
    // Execute success callback if registered
    const callbackKey = `${operator}_subscription_created`;
    if (this.webhookCallbacks.has(callbackKey)) {
      const callback = this.webhookCallbacks.get(callbackKey);
      await callback(subscriptionData);
    }
  }

  /**
   * Handle Zain suspension notification
   */
  async handleZainSuspension(operator, notification) {
    webhookLogger.info(`Zain subscription suspended: ${operator}`);
    
    const subscriptionData = notification.success;
    
    // Mark subscription as suspended
    const suspensionData = {
      uuid: subscriptionData.uuid,
      msisdn: subscriptionData.msisdn,
      suspendedAt: new Date().toISOString(),
      reason: 'INSUFFICIENT_FUNDS',
      willRetry: true
    };
    
    // Execute suspension callback if registered
    const callbackKey = `${operator}_subscription_suspended`;
    if (this.webhookCallbacks.has(callbackKey)) {
      const callback = this.webhookCallbacks.get(callbackKey);
      await callback(suspensionData);
    }
  }

  /**
   * Handle Axiata async completion
   */
  async handleAxiataAsyncCompletion(operator, notification) {
    webhookLogger.info(`Axiata async operation completed: ${operator}`);
    
    const data = notification.success;
    const transactionId = data.transaction_id;
    
    // Check for pending flow
    const flowRef = this.flowManager.getFlowReference(operator, transactionId);
    
    if (flowRef) {
      flowRef.asyncComplete = true;
      flowRef.result = data;
      this.flowManager.clearFlowReference(operator, transactionId);
    }
  }

  /**
   * Handle subscription renewal
   */
  async handleSubscriptionRenewal(operator, notification) {
    webhookLogger.info(`Subscription renewed: ${operator}`);
    
    const renewalData = {
      uuid: notification.success.uuid,
      msisdn: notification.success.msisdn,
      amount: notification.success.amount,
      currency: notification.success.currency,
      nextPayment: notification.success.next_payment_timestamp,
      billId: notification.success.bill_id
    };
    
    // Execute renewal callback
    const callbackKey = `${operator}_subscription_renewed`;
    if (this.webhookCallbacks.has(callbackKey)) {
      const callback = this.webhookCallbacks.get(callbackKey);
      await callback(renewalData);
    }
  }

  /**
   * Handle payment failure
   */
  async handlePaymentFailure(operator, notification) {
    webhookLogger.warn(`Payment failed: ${operator}`);
    
    const failureData = {
      uuid: notification.success?.uuid || notification.error?.uuid,
      reason: notification.success?.transaction?.status || notification.error?.message,
      timestamp: new Date().toISOString()
    };
    
    // Execute failure callback
    const callbackKey = `${operator}_payment_failed`;
    if (this.webhookCallbacks.has(callbackKey)) {
      const callback = this.webhookCallbacks.get(callbackKey);
      await callback(failureData);
    }
  }

  /**
   * Handle subscription deletion
   */
  async handleSubscriptionDeletion(operator, notification) {
    webhookLogger.info(`Subscription deleted: ${operator}`);
    
    const deletionData = {
      uuid: notification.success?.uuid || notification.error?.uuid,
      msisdn: notification.success?.msisdn || notification.error?.msisdn,
      reason: notification.success?.transaction?.status,
      deletedAt: new Date().toISOString()
    };
    
    // Execute deletion callback
    const callbackKey = `${operator}_subscription_deleted`;
    if (this.webhookCallbacks.has(callbackKey)) {
      const callback = this.webhookCallbacks.get(callbackKey);
      await callback(deletionData);
    }
  }

  // ============= CALLBACK MANAGEMENT =============

  /**
   * Register webhook callback
   */
  registerCallback(operator, event, callback) {
    const key = `${operator}_${event}`;
    this.webhookCallbacks.set(key, callback);
  }

  /**
   * Execute registered callbacks
   */
  async executeCallbacks(operator, type, notification) {
    const generalKey = `${operator}_${type}`;
    const wildcardKey = `${operator}_*`;
    
    // Execute specific callback
    if (this.webhookCallbacks.has(generalKey)) {
      const callback = this.webhookCallbacks.get(generalKey);
      await callback(notification);
    }
    
    // Execute wildcard callback
    if (this.webhookCallbacks.has(wildcardKey)) {
      const callback = this.webhookCallbacks.get(wildcardKey);
      await callback(notification);
    }
  }

  // ============= UTILITY METHODS =============

  /**
   * Extract operator from notification
   */
  extractOperator(notification) {
    return notification.success?.operator || 
           notification.error?.operator || 
           null;
  }

  /**
   * Check if operator is UK
   */
  isUKOperator(operator) {
    return ['vodafone-uk', 'three-uk', 'o2-uk', 'ee-uk'].includes(operator);
  }

  /**
   * Store webhook in history
   */
  storeWebhookHistory(operator, notification, result) {
    const entry = {
      timestamp: new Date().toISOString(),
      operator,
      type: notification.success?.type || notification.error?.type,
      status: notification.success?.transaction?.status || notification.error?.transaction?.status,
      notification,
      result
    };
    
    this.webhookHistory.push(entry);
    
    // Keep only last 100 entries
    if (this.webhookHistory.length > 100) {
      this.webhookHistory.shift();
    }
  }

  /**
   * Get webhook status
   */
  getWebhookStatus(req, res) {
    res.json({
      status: 'active',
      totalProcessed: this.webhookHistory.length,
      recentWebhooks: this.webhookHistory.slice(-10).map(h => ({
        timestamp: h.timestamp,
        operator: h.operator,
        type: h.type,
        status: h.status
      }))
    });
  }

  /**
   * Get webhook history
   */
  getWebhookHistory(req, res) {
    const { operator, limit = 20 } = req.query;
    
    let history = this.webhookHistory;
    
    if (operator) {
      history = history.filter(h => h.operator === operator);
    }
    
    res.json(history.slice(-limit));
  }
}

module.exports = WebhookHandler;