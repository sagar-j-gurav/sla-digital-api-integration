/**
 * Complete Operator Configuration Matrix
 * This file contains all operator-specific configurations and requirements
 */

const operatorConfigs = {
  // ============= UK OPERATORS (Special Async Flow) =============
  'vodafone-uk': {
    name: 'Vodafone UK',
    country: 'United Kingdom',
    currency: 'GBP',
    flow: 'checkout_only',
    checkoutUrl: 'http://checkout.sla-alacrity.com/purchase',
    asyncResponse: true,
    noSMS: true,
    spendLimit: '240/month',
    requiresCorrelator: true,
    supportedLanguages: ['en'],
    pinLength: null,
    webhookBased: true
  },
  'three-uk': {
    name: 'Three UK',
    country: 'United Kingdom',
    currency: 'GBP',
    flow: 'checkout_only',
    checkoutUrl: 'http://checkout.sla-alacrity.com/purchase',
    asyncResponse: true,
    noSMS: true,
    spendLimit: '240/month',
    requiresCorrelator: true,
    supportedLanguages: ['en'],
    pinLength: null,
    webhookBased: true
  },
  'o2-uk': {
    name: 'O2 UK',
    country: 'United Kingdom',
    currency: 'GBP',
    flow: 'checkout_only',
    checkoutUrl: 'http://checkout.sla-alacrity.com/purchase',
    asyncResponse: true,
    noSMS: true,
    spendLimit: '240/month',
    requiresCorrelator: true,
    supportedLanguages: ['en'],
    pinLength: null,
    webhookBased: true
  },
  'ee-uk': {
    name: 'EE UK',
    country: 'United Kingdom',
    currency: 'GBP',
    flow: 'checkout_only',
    checkoutUrl: 'http://checkout.sla-alacrity.com/purchase',
    asyncResponse: true,
    noSMS: true,
    spendLimit: '240/month',
    requiresCorrelator: true,
    supportedLanguages: ['en'],
    pinLength: null,
    webhookBased: true
  },

  // ============= TELENOR OPERATORS (ACR-Based) =============
  'telenor-mm': {
    name: 'Telenor Myanmar',
    country: 'Myanmar',
    currency: 'MMK',
    flow: 'checkout_with_acr',
    usesACR: true,
    acrLength: 48,
    checkoutUrl: 'http://checkout.sla-alacrity.com/purchase',
    requiresCorrelator: true,
    identifierFormat: 'telenor-TLN-MM:{30_char_id}{18_char_variable}',
    supportedLanguages: ['en', 'my'],
    maxCharge: 10000,
    pinLength: 5
  },
  'telenor-dk': {
    name: 'Telenor Denmark',
    country: 'Denmark',
    currency: 'DKK',
    flow: 'checkout_with_acr',
    usesACR: true,
    acrLength: 48,
    checkoutUrl: 'http://checkout.sla-alacrity.com/purchase',
    requiresCorrelator: true,
    supportedLanguages: ['da'],
    maxCharge: 5000,
    monthlyLimit: 2500,
    dailyLimit: 750,
    pinLength: 5
  },
  'telenor-no': {
    name: 'Telenor Norway',
    country: 'Norway',
    currency: 'NOK',
    flow: 'checkout_with_acr',
    usesACR: true,
    acrLength: 48,
    checkoutUrl: 'http://checkout.sla-alacrity.com/purchase',
    requiresCorrelator: true,
    supportedLanguages: ['no'],
    maxCharge: 5000,
    monthlyLimit: 5000,
    pinLength: 5
  },
  'telenor-se': {
    name: 'Telenor Sweden',
    country: 'Sweden',
    currency: 'SEK',
    flow: 'checkout_with_acr',
    usesACR: true,
    acrLength: 48,
    checkoutUrl: 'http://checkout.sla-alacrity.com/purchase',
    requiresCorrelator: true,
    supportedLanguages: ['sv'],
    maxCharge: 5000,
    pinLength: 5
  },
  'telenor-digi': {
    name: 'Telenor Digi',
    country: 'Malaysia',
    currency: 'MYR',
    flow: 'checkout_or_api',
    checkoutUrl: 'http://checkout.sla-alacrity.com/purchase',
    requiresCorrelator: true,
    supportedLanguages: ['en'],
    maxCharge: 100,
    monthlyLimit: 300,
    oneSubscriptionPerWeek: true,
    pinLength: 5
  },
  'telenor-rs': {
    name: 'Yettel Serbia',
    country: 'Serbia',
    currency: 'RSD',
    flow: 'checkout_with_acr',
    usesACR: true,
    acrLength: 48,
    checkoutUrl: 'http://checkout.sla-alacrity.com/purchase',
    requiresCorrelator: true,
    supportedLanguages: ['sr', 'en'],
    maxCharge: 960,
    dailyLimit: 2400,
    monthlyLimit: 4800,
    pinLength: 5
  },

  // ============= ZAIN OPERATORS (Special Status) =============
  'zain-kw': {
    name: 'Zain Kuwait',
    country: 'Kuwait',
    currency: 'KWD',
    flow: 'checkout_only',
    checkoutUrl: 'http://msisdn.sla-alacrity.com/purchase',
    checkoutRequiresRedirect: true,
    pinLength: 4,
    statusResponse: 'SUCCESS',
    statusNotifications: true,
    suspendOnInsufficientFunds: true,
    supportedLanguages: ['en', 'ar'],
    maxCharge: 30,
    monthlyLimitPostpaid: 90,
    oneSubscriptionPerWeek: true,
    shortCode: '93052',
    // Environment-specific configurations
    environments: {
      sandbox: {
        baseUrl: 'https://api.sla-alacrity.com/api/alacrity/v2.2',
        checkoutUrl: 'http://msisdn-sandbox.sla-alacrity.com/purchase'
      },
      production: {
        baseUrl: 'https://api.sla-alacrity.com/api/alacrity/v2.2',
        checkoutUrl: 'https://msisdn.sla-alacrity.com/purchase'
      }
    }
  },
  'zain-sa': {
    name: 'Zain KSA',
    country: 'Saudi Arabia',
    currency: 'SAR',
    flow: 'checkout_only',
    checkoutUrl: 'http://msisdn.sla-alacrity.com/purchase',
    checkoutRequiresRedirect: true,
    pinLength: 6,
    statusResponse: 'SUCCESS',
    recurringNotifications: false,
    supportedLanguages: ['ar'],
    maxCharge: 30,
    monthlyLimit: 30,
    // Environment-specific configurations
    environments: {
      sandbox: {
        baseUrl: 'https://api.sla-alacrity.com/api/alacrity/v2.2',
        checkoutUrl: 'http://msisdn-sandbox.sla-alacrity.com/purchase'
      },
      production: {
        baseUrl: 'https://api.sla-alacrity.com/api/alacrity/v2.2',
        checkoutUrl: 'https://msisdn.sla-alacrity.com/purchase'
      }
    }
  },
  'zain-bh': {
    name: 'Zain Bahrain',
    country: 'Bahrain',
    currency: 'BHD',
    flow: 'pin_api_allowed',
    checkoutUrl: 'http://msisdn.sla-alacrity.com/purchase',
    checkoutRequiresRedirect: true,
    pinLength: 5,
    supportedLanguages: ['en', 'ar'],
    maxCharge: 30,
    monthlyLimitPostpaid: 30,
    moSMS: true,
    shortCode: '94005',
    // Environment-specific configurations
    environments: {
      sandbox: {
        baseUrl: 'https://api.sla-alacrity.com/api/alacrity/v2.2',
        checkoutUrl: 'http://msisdn-sandbox.sla-alacrity.com/purchase',
        testPin: '000000',
        testMsisdn: '97312345678'
      },
      production: {
        baseUrl: 'https://api.sla-alacrity.com/api/alacrity/v2.2',
        checkoutUrl: 'https://msisdn.sla-alacrity.com/purchase'
      },
      preproduction: {
        baseUrl: 'https://api-pp.sla-alacrity.com/api/alacrity/v2.2',
        checkoutUrl: 'https://msisdn-pp.sla-alacrity.com/purchase'
      }
    }
  },
  'zain-jo': {
    name: 'Zain Jordan',
    country: 'Jordan',
    currency: 'JOD',
    flow: 'pin_api_allowed',
    checkoutUrl: 'http://msisdn.sla-alacrity.com/purchase',
    checkoutRequiresRedirect: true,
    pinLength: 5,
    supportedLanguages: ['en', 'ar'],
    moSMS: true,
    shortCode: '97970',
    // Environment-specific configurations
    environments: {
      sandbox: {
        baseUrl: 'https://api.sla-alacrity.com/api/alacrity/v2.2',
        checkoutUrl: 'http://msisdn-sandbox.sla-alacrity.com/purchase'
      },
      production: {
        baseUrl: 'https://api.sla-alacrity.com/api/alacrity/v2.2',
        checkoutUrl: 'https://msisdn.sla-alacrity.com/purchase'
      }
    }
  },
  'zain-iq': {
    name: 'Zain Iraq',
    country: 'Iraq',
    currency: 'IQD',
    flow: 'checkout_only',
    checkoutUrl: 'http://checkout.sla-alacrity.com/purchase',
    pinLength: 5,
    supportedLanguages: ['ar'],
    maxCharge: 88000,
    monthlyLimit: 88000
  },
  'zain-sd': {
    name: 'Zain Sudan',
    country: 'Sudan',
    currency: 'SDG',
    flow: 'checkout_only',
    checkoutUrl: 'http://checkout.sla-alacrity.com/purchase',
    pinLength: 5,
    supportedLanguages: ['en', 'ar'],
    maxCharge: 30
  },

  // ============= SPECIAL INTEGRATION OPERATORS =============
  'axiata-lk': {
    name: 'Axiata Dialog',
    country: 'Sri Lanka',
    currency: 'LKR',
    flow: 'checkout_async',
    checkoutUrl: 'https://checkout.sla-alacrity.com/purchase/axiata',
    asyncResponse: true,
    requiresTransactionId: true,
    noTrialSupport: true,
    supportedLanguages: ['en'],
    pinLength: 5
  },
  'mobily-sa': {
    name: 'Mobily KSA',
    country: 'Saudi Arabia',
    currency: 'SAR',
    flow: 'pin_with_fraud_prevention',
    requiresFraudToken: true,
    fraudScriptUrl: 'provided_by_sla',
    dualPageIntegration: true,
    noDeleteAPI: true,
    dynamicSMS: true,
    supportedLanguages: ['ar'],
    pinLength: 5
  },
  'ooredoo-kw': {
    name: 'Ooredoo Kuwait',
    country: 'Kuwait',
    currency: 'KWD',
    flow: 'checkout_or_pin',
    pinLength: 4,
    requiresAmount: true,
    perServiceShortcode: true,
    supportedLanguages: ['en', 'ar'],
    configurableLimit: true
  },
  'stc-kw': {
    name: 'STC Kuwait',
    country: 'Kuwait',
    currency: 'KWD',
    flow: 'checkout_only',
    checkoutUrl: 'http://checkout.sla-alacrity.com/purchase',
    perServiceShortcode: true,
    supportedLanguages: ['en', 'ar'],
    maxCharge: 20,
    monthlyLimitPostpaid: 20,
    monthlyLimitPrepaid: 90,
    pinLength: 5
  },
  'etisalat-ae': {
    name: 'Etisalat UAE',
    country: 'United Arab Emirates',
    currency: 'AED',
    flow: 'checkout_only',
    noLandingPage: true,
    checkoutUrl: 'http://checkout.sla-alacrity.com/purchase',
    supportedLanguages: ['en', 'ar'],
    yearlyLimit: 365,
    monthlyLimitPostpaid: 200,
    monthlyLimitPrepaid: 1000,
    pinLength: 5,
    shortCode: '1090'
  },

  // ============= STANDARD OPERATORS =============
  '9mobile-ng': {
    name: '9mobile',
    country: 'Nigeria',
    currency: 'NGN',
    flow: 'checkout',
    checkoutUrl: 'http://checkout.sla-alacrity.com/purchase',
    supportedLanguages: ['en'],
    pinLength: 5
  },
  'movitel-mz': {
    name: 'Movitel',
    country: 'Mozambique',
    currency: 'MZN',
    flow: 'checkout',
    checkoutUrl: 'http://checkout.sla-alacrity.com/purchase',
    supportedLanguages: ['pt'],
    pinLength: 5,
    fallbackCharging: true
  },
  'three-ie': {
    name: 'Three Ireland',
    country: 'Ireland',
    currency: 'EUR',
    flow: 'checkout',
    checkoutUrl: 'http://checkout.sla-alacrity.com/purchase',
    supportedLanguages: ['en'],
    maxCharge: 50,
    monthlyLimit: 150,
    moSMS: true,
    pinLength: 5
  },
  'vodafone-ie': {
    name: 'Vodafone Ireland',
    country: 'Ireland',
    currency: 'EUR',
    flow: 'pin_api_allowed',
    supportedLanguages: ['en'],
    maxCharge: 30,
    dailyLimit: 30,
    monthlyLimit: 60,
    moSMS: true,
    shortCode: '50082',
    pinLength: 5
  },
  'umobile-my': {
    name: 'U Mobile Malaysia',
    country: 'Malaysia',
    currency: 'MYR',
    flow: 'checkout_or_api',
    checkoutUrl: 'http://checkout.sla-alacrity.com/purchase',
    supportedLanguages: ['en'],
    maxCharge: 300,
    monthlyLimit: 300,
    dailyLimit: 250,
    noMOSMS: true,
    pinLength: 5
  }
};

// Helper function to get operator by country
function getOperatorsByCountry(country) {
  return Object.entries(operatorConfigs)
    .filter(([_, config]) => config.country === country)
    .map(([code, config]) => ({ code, ...config }));
}

// Helper function to get operators by flow type
function getOperatorsByFlow(flowType) {
  return Object.entries(operatorConfigs)
    .filter(([_, config]) => config.flow === flowType)
    .map(([code, config]) => ({ code, ...config }));
}

// Helper function to check if operator supports PIN API
function supportsPINAPI(operatorCode) {
  const config = operatorConfigs[operatorCode];
  return config && (
    config.flow === 'pin_api_allowed' ||
    config.flow === 'checkout_or_pin' ||
    config.flow === 'pin_with_fraud_prevention' ||
    config.flow === 'checkout_or_api'
  );
}

// Helper function to get checkout URL for operator
function getCheckoutUrl(operatorCode, environment = 'production') {
  const config = operatorConfigs[operatorCode];
  
  // Check for environment-specific checkout URL
  if (config?.environments?.[environment]?.checkoutUrl) {
    return config.environments[environment].checkoutUrl;
  }
  
  // Return default checkout URL
  return config?.checkoutUrl || 'http://checkout.sla-alacrity.com/purchase';
}

// Helper function to get base API URL for operator
function getApiBaseUrl(operatorCode, environment = 'production') {
  const config = operatorConfigs[operatorCode];
  
  // Check for environment-specific API base URL
  if (config?.environments?.[environment]?.baseUrl) {
    return config.environments[environment].baseUrl;
  }
  
  // Default base URLs
  const defaultUrls = {
    sandbox: 'https://api.sla-alacrity.com/api/alacrity/v2.2',
    production: 'https://api.sla-alacrity.com/api/alacrity/v2.2',
    preproduction: 'https://api-pp.sla-alacrity.com/api/alacrity/v2.2'
  };
  
  return defaultUrls[environment] || defaultUrls.production;
}

// Helper function to check if operator requires redirect for checkout
function requiresCheckoutRedirect(operatorCode) {
  const config = operatorConfigs[operatorCode];
  return config?.checkoutRequiresRedirect || false;
}

// Helper function to get test credentials for sandbox
function getTestCredentials(operatorCode) {
  const config = operatorConfigs[operatorCode];
  return config?.environments?.sandbox || {
    testPin: '000000',
    testMsisdn: null
  };
}

module.exports = {
  operatorConfigs,
  getOperatorsByCountry,
  getOperatorsByFlow,
  supportsPINAPI,
  getCheckoutUrl,
  getApiBaseUrl,
  requiresCheckoutRedirect,
  getTestCredentials
};