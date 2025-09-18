/**
 * Subscription Manager
 * Manages subscription lifecycle and operations
 */

const { operatorLogger } = require('../../utils/logger');
const { operatorConfigs } = require('../../config/operators.config');

class SubscriptionManager {
  constructor(slaClient, flowManager) {
    this.slaClient = slaClient;
    this.flowManager = flowManager;
    
    // In-memory subscription store (should be replaced with database in production)
    this.subscriptions = new Map();
    this.subscriptionsByMSISDN = new Map();
  }

  /**
   * Create new subscription
   */
  async createSubscription(operator, params) {
    const config = operatorConfigs[operator];
    
    operatorLogger.logOperation(operator, 'Creating subscription', params);
    
    try {
      // Check for existing subscription
      const existing = await this.checkExistingSubscription(operator, params.msisdn, params.campaign);
      if (existing) {
        throw new Error('Subscription already exists for this MSISDN and service');
      }
      
      // Use flow manager to initiate subscription
      const result = await this.flowManager.initiateSubscription(operator, params);
      
      // Store subscription if created immediately
      if (result.success && result.data?.uuid) {
        await this.storeSubscription(operator, result.data);
      }
      
      return result;
      
    } catch (error) {
      operatorLogger.logFailure(operator, 'Subscription creation failed', error);
      throw error;
    }
  }

  /**
   * Delete subscription
   */
  async deleteSubscription(operator, params) {
    const config = operatorConfigs[operator];
    
    operatorLogger.logOperation(operator, 'Deleting subscription', params);
    
    // Check if operator supports delete API
    if (config.noDeleteAPI) {
      throw new Error(`Delete API not available for ${operator}. Subscription will be terminated by operator.`);
    }
    
    try {
      // Get stored subscription data
      const subscription = this.getSubscription(params.uuid);
      
      // Handle ACR for Telenor
      if (config.usesACR && subscription?.acr) {
        params.msisdn = subscription.acr;
      }
      
      // Delete via API
      const result = await this.slaClient.deleteSubscription(operator, params);
      
      // Remove from store
      if (result.success) {
        this.removeSubscription(params.uuid);
      }
      
      return result;
      
    } catch (error) {
      operatorLogger.logFailure(operator, 'Subscription deletion failed', error);
      throw error;
    }
  }

  /**
   * Get subscription status
   */
  async getSubscriptionStatus(operator, params) {
    operatorLogger.logOperation(operator, 'Getting subscription status', params);
    
    try {
      const result = await this.slaClient.getSubscriptionStatus(operator, params);
      
      // Update stored subscription
      if (result.success && result.data) {
        await this.updateSubscription(result.data.uuid, {
          status: result.data.status,
          nextPayment: result.data.next_payment_timestamp,
          lastChecked: new Date().toISOString()
        });
      }
      
      return result;
      
    } catch (error) {
      operatorLogger.logFailure(operator, 'Status check failed', error);
      throw error;
    }
  }

  /**
   * Pause subscription (if supported)
   */
  async pauseSubscription(operator, params) {
    const config = operatorConfigs[operator];
    
    if (!config.supportsPause) {
      throw new Error(`Pause not supported for ${operator}`);
    }
    
    // Implementation would depend on operator support
    throw new Error('Pause functionality not yet implemented');
  }

  /**
   * Resume subscription
   */
  async resumeSubscription(operator, params) {
    operatorLogger.logOperation(operator, 'Resuming subscription', params);
    
    try {
      // Check if subscription was removed
      const subscription = this.getSubscription(params.uuid);
      
      if (!subscription || subscription.status !== 'REMOVED') {
        throw new Error('Only removed subscriptions can be resumed');
      }
      
      // Check if within 30-day grace period
      const removedDate = new Date(subscription.removedAt);
      const daysSinceRemoval = (Date.now() - removedDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceRemoval > 30) {
        throw new Error('Grace period exceeded. Cannot resume subscription.');
      }
      
      // Resume via API
      const result = await this.slaClient.makeRequest(
        '/v2.2/subscription/resume',
        { uuid: params.uuid },
        operator
      );
      
      // Update subscription status
      if (result.success) {
        await this.updateSubscription(params.uuid, {
          status: 'ACTIVE',
          resumedAt: new Date().toISOString()
        });
      }
      
      return result;
      
    } catch (error) {
      operatorLogger.logFailure(operator, 'Subscription resume failed', error);
      throw error;
    }
  }

  /**
   * Apply free trial/coupon
   */
  async applyFreeTrial(operator, params) {
    const config = operatorConfigs[operator];
    
    // Check if operator supports free trials
    if (config.noTrialSupport) {
      throw new Error(`Free trials not supported for ${operator}`);
    }
    
    operatorLogger.logOperation(operator, 'Applying free trial', params);
    
    try {
      const result = await this.slaClient.makeRequest(
        '/v2.2/subscription/coupon',
        {
          uuid: params.uuid,
          trial_days: params.trialDays
        },
        operator
      );
      
      // Update subscription
      if (result.success) {
        await this.updateSubscription(params.uuid, {
          status: 'FREE',
          trialEndsAt: new Date(Date.now() + (params.trialDays * 24 * 60 * 60 * 1000)).toISOString()
        });
      }
      
      return result;
      
    } catch (error) {
      operatorLogger.logFailure(operator, 'Free trial application failed', error);
      throw error;
    }
  }

  // ============= SUBSCRIPTION QUERIES =============

  /**
   * Get all subscriptions for an operator
   */
  getOperatorSubscriptions(operator) {
    const subscriptions = [];
    
    for (const [uuid, sub] of this.subscriptions.entries()) {
      if (sub.operator === operator) {
        subscriptions.push(sub);
      }
    }
    
    return subscriptions;
  }

  /**
   * Get subscriptions by MSISDN
   */
  getMSISDNSubscriptions(msisdn) {
    return this.subscriptionsByMSISDN.get(msisdn) || [];
  }

  /**
   * Get active subscriptions
   */
  getActiveSubscriptions(operator = null) {
    const activeStatuses = ['ACTIVE', 'FREE'];
    const subscriptions = [];
    
    for (const [uuid, sub] of this.subscriptions.entries()) {
      if (activeStatuses.includes(sub.status)) {
        if (!operator || sub.operator === operator) {
          subscriptions.push(sub);
        }
      }
    }
    
    return subscriptions;
  }

  /**
   * Get suspended subscriptions
   */
  getSuspendedSubscriptions(operator = null) {
    const subscriptions = [];
    
    for (const [uuid, sub] of this.subscriptions.entries()) {
      if (sub.status === 'SUSPENDED') {
        if (!operator || sub.operator === operator) {
          subscriptions.push(sub);
        }
      }
    }
    
    return subscriptions;
  }

  // ============= SUBSCRIPTION LIFECYCLE HANDLERS =============

  /**
   * Handle subscription renewal
   */
  async handleRenewal(operator, renewalData) {
    operatorLogger.info(`Handling renewal for ${operator}`, renewalData);
    
    await this.updateSubscription(renewalData.uuid, {
      lastRenewal: new Date().toISOString(),
      nextPayment: renewalData.next_payment_timestamp,
      renewalCount: (this.getSubscription(renewalData.uuid)?.renewalCount || 0) + 1
    });
  }

  /**
   * Handle subscription suspension
   */
  async handleSuspension(operator, suspensionData) {
    operatorLogger.info(`Handling suspension for ${operator}`, suspensionData);
    
    await this.updateSubscription(suspensionData.uuid, {
      status: 'SUSPENDED',
      suspendedAt: new Date().toISOString(),
      suspensionReason: suspensionData.reason
    });
  }

  /**
   * Handle subscription reactivation
   */
  async handleReactivation(operator, reactivationData) {
    operatorLogger.info(`Handling reactivation for ${operator}`, reactivationData);
    
    await this.updateSubscription(reactivationData.uuid, {
      status: 'ACTIVE',
      reactivatedAt: new Date().toISOString(),
      suspendedAt: null,
      suspensionReason: null
    });
  }

  // ============= STORAGE METHODS =============

  /**
   * Check for existing subscription
   */
  async checkExistingSubscription(operator, msisdn, campaign) {
    const msisdnSubs = this.subscriptionsByMSISDN.get(msisdn) || [];
    
    return msisdnSubs.find(sub => 
      sub.operator === operator && 
      sub.campaign === campaign &&
      ['ACTIVE', 'FREE', 'SUSPENDED'].includes(sub.status)
    );
  }

  /**
   * Store subscription
   */
  async storeSubscription(operator, subscriptionData) {
    const subscription = {
      ...subscriptionData,
      operator,
      createdAt: new Date().toISOString(),
      status: subscriptionData.transaction?.status || 'ACTIVE'
    };
    
    // Store by UUID
    this.subscriptions.set(subscriptionData.uuid, subscription);
    
    // Store by MSISDN
    const msisdn = subscriptionData.msisdn;
    if (msisdn) {
      const msisdnSubs = this.subscriptionsByMSISDN.get(msisdn) || [];
      msisdnSubs.push(subscription);
      this.subscriptionsByMSISDN.set(msisdn, msisdnSubs);
    }
    
    // Handle ACR for Telenor
    if (msisdn?.startsWith('telenor-')) {
      subscription.acr = msisdn;
      subscription.hasACR = true;
    }
    
    operatorLogger.info(`Subscription stored: ${subscriptionData.uuid} for ${operator}`);
    
    return subscription;
  }

  /**
   * Get subscription by UUID
   */
  getSubscription(uuid) {
    return this.subscriptions.get(uuid);
  }

  /**
   * Update subscription
   */
  async updateSubscription(uuid, updates) {
    const subscription = this.subscriptions.get(uuid);
    
    if (subscription) {
      Object.assign(subscription, updates, {
        updatedAt: new Date().toISOString()
      });
      
      this.subscriptions.set(uuid, subscription);
      
      operatorLogger.debug(`Subscription updated: ${uuid}`, updates);
    }
    
    return subscription;
  }

  /**
   * Remove subscription
   */
  removeSubscription(uuid) {
    const subscription = this.subscriptions.get(uuid);
    
    if (subscription) {
      // Remove from UUID map
      this.subscriptions.delete(uuid);
      
      // Remove from MSISDN map
      const msisdn = subscription.msisdn;
      if (msisdn) {
        const msisdnSubs = this.subscriptionsByMSISDN.get(msisdn) || [];
        const filtered = msisdnSubs.filter(sub => sub.uuid !== uuid);
        
        if (filtered.length > 0) {
          this.subscriptionsByMSISDN.set(msisdn, filtered);
        } else {
          this.subscriptionsByMSISDN.delete(msisdn);
        }
      }
      
      operatorLogger.info(`Subscription removed: ${uuid}`);
    }
  }

  /**
   * Get subscription statistics
   */
  getStatistics() {
    const stats = {
      total: this.subscriptions.size,
      byStatus: {},
      byOperator: {},
      byCountry: {}
    };
    
    for (const [uuid, sub] of this.subscriptions.entries()) {
      // By status
      stats.byStatus[sub.status] = (stats.byStatus[sub.status] || 0) + 1;
      
      // By operator
      stats.byOperator[sub.operator] = (stats.byOperator[sub.operator] || 0) + 1;
      
      // By country
      const config = operatorConfigs[sub.operator];
      if (config?.country) {
        stats.byCountry[config.country] = (stats.byCountry[config.country] || 0) + 1;
      }
    }
    
    return stats;
  }
}

module.exports = SubscriptionManager;