/**
 * API Configuration
 * Contains all API endpoints and environment configurations
 */

const apiConfig = {
  environments: {
    sandbox: {
      baseUrl: 'https://api-sandbox.sla-alacrity.com',
      checkoutUrl: 'http://checkout-sandbox.sla-alacrity.com',
      description: 'Sandbox environment for testing (no real charges)',
      pinValue: '000000', // Fixed PIN for sandbox
      characteristics: {
        noRealCharges: true,
        fixedPin: true,
        maxTestDuration: '4 hours'
      }
    },
    production: {
      baseUrl: 'https://api.sla-alacrity.com',
      checkoutUrl: 'http://checkout.sla-alacrity.com',
      description: 'Live production environment (real charges)',
      characteristics: {
        realCharges: true,
        requiresApproval: true,
        ipWhitelisting: true
      }
    },
    preproduction: {
      baseUrl: 'https://api-preprod.sla-alacrity.com',
      checkoutUrl: 'http://checkout-preprod.sla-alacrity.com',
      description: 'Pre-production environment (operator staging)',
      characteristics: {
        operatorStaging: true,
        limitedOperators: true
      }
    }
  },

  // API Version
  version: 'v2.2',

  // API Endpoints
  endpoints: {
    // Subscription Management
    subscription: {
      create: '/v2.2/subscription/create',
      delete: '/v2.2/subscription/delete',
      status: '/v2.2/subscription/status',
      activate: '/v2.2/subscription/activate',
      cancel: '/v2.2/subscription/cancel',
      resume: '/v2.2/subscription/resume',
      coupon: '/v2.2/subscription/coupon'
    },

    // Billing
    billing: {
      charge: '/v2.2/charge',
      refund: '/v2.2/refund'
    },

    // PIN Management
    pin: {
      generate: '/v2.2/pin'
    },

    // SMS
    sms: {
      send: '/v2.2/sms'
    },

    // Eligibility
    eligibility: {
      checkDOB: '/v2.2/eligibility/dob'
    },

    // Sandbox specific
    sandbox: {
      listMSISDNs: '/v2.2/sandbox/msisdns',
      provisionMSISDN: '/v2.2/sandbox/provision',
      provisionToken: '/v2.2/sandbox/provision/token'
    },

    // MSISDN Retrieval (for Header Enrichment)
    msisdn: {
      retrieve: '/v2.2/msisdn/retrieve'
    }
  },

  // HTTP Configuration
  http: {
    method: 'POST', // All requests use POST
    contentType: 'application/json',
    accept: 'application/json',
    timeout: 30000, // 30 seconds
    retries: 3,
    retryDelay: 1000 // 1 second
  },

  // Response Status Codes
  statusCodes: {
    success: {
      CHARGED: 'Transaction successful',
      SUCCESS: 'Operation successful (Zain operators)',
      PENDING: 'Transaction pending (async operators)',
      ACTIVE: 'Subscription active',
      FREE: 'Free trial period active'
    },
    failure: {
      INSUFFICIENT_FUNDS: 'Insufficient balance',
      ACCOUNT_NOT_FOUND: 'Account not found',
      INVALID_PIN: 'Invalid PIN',
      PIN_EXPIRED: 'PIN has expired',
      SUBSCRIPTION_EXISTS: 'Subscription already exists',
      SERVICE_NOT_APPROVED: 'Service not approved',
      BLOCKED: 'MSISDN blocked by fraud prevention',
      INVALID_MSISDN: 'Invalid MSISDN format',
      OPERATOR_ERROR: 'Operator system error'
    },
    subscription: {
      ACTIVE: 'Subscription active and billing',
      CANCELLED: 'Cancelled due to customer type change',
      CREATED: 'Created but initial charge failed',
      DELETED: 'Deleted by operator or merchant',
      EXPIRED: 'Subscription expired',
      FREE: 'In free trial period',
      INACTIVE: 'Not yet activated',
      REMOVED: 'Exceeded retry grace period',
      SUSPENDED: 'Suspended due to insufficient funds',
      WAITING: 'Waiting for activation'
    }
  },

  // Error Categories
  errorCategories: {
    'Authorization': {
      '1001': 'Basic Auth required. Invalid credentials',
      '1002': 'IP not whitelisted',
      '1003': 'Service not approved for operator'
    },
    'PIN API': {
      '3001': 'PIN sending failed',
      '3002': 'PIN expired',
      '3003': 'Invalid MSISDN format',
      '3004': 'PIN generation limit exceeded'
    },
    'Subscription API': {
      '4001': 'Subscription already exists',
      '4002': 'Invalid campaign ID',
      '4003': 'Invalid merchant ID',
      '4004': 'Free trial not approved',
      '4005': 'Maximum subscriptions reached'
    },
    'Charge API': {
      '5001': 'Charge failed',
      '5002': 'Invalid amount',
      '5003': 'Daily limit exceeded',
      '5004': 'Monthly limit exceeded'
    },
    'SMS API': {
      '8001': 'SMS sending failed',
      '8002': 'Invalid message format',
      '8003': 'SMS not supported for operator'
    }
  },

  // Checkout Configuration
  checkout: {
    tokenValidity: 120, // seconds
    pinValidity: 120, // seconds
    parameters: {
      required: ['merchant', 'service', 'redirect_url'],
      optional: ['correlator', 'price', 'transaction_id', 'language']
    }
  },

  // Webhook Configuration
  webhook: {
    events: [
      'subscription.created',
      'subscription.renewed',
      'subscription.failed',
      'subscription.deleted',
      'subscription.suspended',
      'subscription.activated',
      'charge.success',
      'charge.failed'
    ],
    timeout: 10000, // 10 seconds
    retries: 3
  },

  // Rate Limiting
  rateLimit: {
    default: {
      requests: 100,
      period: 60 // seconds
    },
    perOperator: {
      'mobily-sa': {
        requests: 50,
        period: 60
      }
    }
  }
};

// Helper function to get endpoint URL
function getEndpointUrl(environment, endpointPath) {
  const env = apiConfig.environments[environment];
  if (!env) {
    throw new Error(`Invalid environment: ${environment}`);
  }
  return `${env.baseUrl}${endpointPath}`;
}

// Helper function to get checkout URL
function getCheckoutUrl(environment, operator) {
  const env = apiConfig.environments[environment];
  const { operatorConfigs } = require('./operators.config');
  const operatorConfig = operatorConfigs[operator];
  
  // Use operator-specific checkout URL if available
  if (operatorConfig?.checkoutUrl) {
    // Replace base URL with environment-specific URL
    if (environment === 'sandbox') {
      return operatorConfig.checkoutUrl.replace('checkout.sla-alacrity.com', 'checkout-sandbox.sla-alacrity.com');
    }
    return operatorConfig.checkoutUrl;
  }
  
  return env.checkoutUrl + '/purchase';
}

module.exports = {
  apiConfig,
  getEndpointUrl,
  getCheckoutUrl
};