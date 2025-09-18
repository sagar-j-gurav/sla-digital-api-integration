/**
 * Response Handler
 * Unified response processing for all operator-specific responses
 */

const { operatorConfigs } = require('../../config/operators.config');
const { apiConfig } = require('../../config/api.config');

class ResponseHandler {
  constructor() {
    this.responseCache = new Map();
  }

  /**
   * Process API response based on operator and response type
   */
  processResponse(response, operator, requestType) {
    const config = operatorConfigs[operator];
    
    if (!response) {
      throw new Error('Empty response received');
    }

    // Determine if response is success or error
    if (response.error) {
      return this.handleErrorResponse(response.error, operator);
    }

    if (response.success) {
      return this.handleSuccessResponse(response.success, operator, requestType);
    }

    // Handle pending/async responses
    if (response.status === 'PENDING') {
      return this.handlePendingResponse(response, operator);
    }

    return response;
  }

  /**
   * Handle successful responses
   */
  handleSuccessResponse(success, operator, requestType) {
    const config = operatorConfigs[operator];
    
    // Normalize response structure
    const normalized = {
      success: true,
      operator,
      type: success.type || requestType,
      data: { ...success }
    };

    // Handle operator-specific transformations
    
    // Zain operators: Convert SUCCESS to CHARGED for consistency
    if (config.statusResponse === 'SUCCESS') {
      if (normalized.data.transaction?.status === 'SUCCESS') {
        normalized.data.transaction.status = 'CHARGED';
        normalized.data._originalStatus = 'SUCCESS';
      }
    }

    // Telenor operators: Mark ACR presence
    if (config.usesACR && normalized.data.msisdn) {
      if (normalized.data.msisdn.startsWith('telenor-')) {
        normalized.hasACR = true;
        normalized.acr = normalized.data.msisdn;
        normalized.acrIdentifier = this.extractACRIdentifier(normalized.data.msisdn);
      }
    }

    // UK operators: Mark as async
    if (config.asyncResponse || config.webhookBased) {
      normalized.isAsync = true;
      normalized.requiresWebhook = true;
    }

    // Add metadata
    normalized.metadata = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      operatorConfig: {
        flow: config.flow,
        currency: config.currency,
        country: config.country
      }
    };

    return normalized;
  }

  /**
   * Handle error responses
   */
  handleErrorResponse(error, operator) {
    const config = operatorConfigs[operator];
    
    // Look up error details
    const errorDetails = this.getErrorDetails(error.category, error.code);
    
    return {
      success: false,
      operator,
      error: {
        ...error,
        details: errorDetails,
        isRetryable: this.isRetryableError(error.code),
        suggestedAction: this.getSuggestedAction(error.code, operator)
      },
      metadata: {
        timestamp: new Date().toISOString(),
        operatorConfig: {
          flow: config.flow,
          currency: config.currency,
          country: config.country
        }
      }
    };
  }

  /**
   * Handle pending/async responses
   */
  handlePendingResponse(response, operator) {
    return {
      success: null, // Pending state
      operator,
      status: 'PENDING',
      data: response,
      requiresCallback: true,
      metadata: {
        timestamp: new Date().toISOString(),
        expectedCallbackTime: 120 // seconds
      }
    };
  }

  /**
   * Extract ACR identifier from full ACR string
   */
  extractACRIdentifier(acr) {
    // ACR format: "telenor-TLN-MM:XXX..." (first 30 chars are unique ID)
    const parts = acr.split(':');
    if (parts.length > 1) {
      return parts[1].substring(0, 30);
    }
    return acr;
  }

  /**
   * Get error details from error code
   */
  getErrorDetails(category, code) {
    const errorCategories = apiConfig.errorCategories;
    
    if (errorCategories[category] && errorCategories[category][code]) {
      return errorCategories[category][code];
    }
    
    return 'Unknown error';
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(code) {
    const retryableErrors = [
      '3001', // PIN sending failed
      '3002', // PIN expired
      '5001', // Charge failed
      '8001'  // SMS sending failed
    ];
    
    return retryableErrors.includes(code);
  }

  /**
   * Get suggested action for error
   */
  getSuggestedAction(errorCode, operator) {
    const actions = {
      '1001': 'Check API credentials',
      '1002': 'Whitelist your IP address in the Alacrity portal',
      '1003': 'Ensure service is approved for this operator',
      '3001': 'Retry PIN generation',
      '3002': 'Generate new PIN (previous expired)',
      '3004': 'Wait before requesting new PIN',
      '4001': 'Check if subscription already exists',
      '4004': 'Enable free trial in service settings',
      '5003': 'Daily limit reached, retry tomorrow',
      '5004': 'Monthly limit reached',
      '8003': `SMS not supported for ${operator}`
    };
    
    return actions[errorCode] || 'Contact support';
  }

  /**
   * Process webhook notification
   */
  processWebhookNotification(notification) {
    if (!notification) {
      throw new Error('Invalid webhook notification');
    }

    const operator = notification.success?.operator || notification.error?.operator;
    
    if (!operator) {
      throw new Error('Operator not identified in webhook');
    }

    const config = operatorConfigs[operator];
    
    // Process based on notification type
    const type = notification.success?.type || notification.error?.type;
    const status = notification.success?.transaction?.status || notification.error?.transaction?.status;
    
    const processed = {
      operator,
      type,
      status,
      data: notification.success || notification.error,
      timestamp: new Date().toISOString()
    };

    // Handle special statuses
    if (status === 'SUSPENDED' && config.suspendOnInsufficientFunds) {
      processed.action = 'WAIT_FOR_TOPUP';
      processed.willRetry = true;
    }

    if (status === 'DELETED') {
      processed.action = 'SUBSCRIPTION_TERMINATED';
    }

    if (status === 'REMOVED') {
      processed.action = 'EXCEEDED_RETRY_PERIOD';
      processed.canResume = this.canResumeSubscription(notification);
    }

    return processed;
  }

  /**
   * Check if subscription can be resumed
   */
  canResumeSubscription(notification) {
    // Can resume if not exceeded 30 days of retries
    const removedDate = new Date(notification.success?.timestamp || notification.error?.timestamp);
    const daysSinceRemoval = (Date.now() - removedDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceRemoval < 30;
  }

  /**
   * Format response for client
   */
  formatForClient(response) {
    if (response.success) {
      return {
        success: true,
        data: response.data,
        metadata: response.metadata
      };
    } else {
      return {
        success: false,
        error: response.error,
        metadata: response.metadata
      };
    }
  }
}

module.exports = ResponseHandler;