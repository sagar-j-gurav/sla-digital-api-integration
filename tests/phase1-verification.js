/**
 * Phase 1 Verification Tests
 * Comprehensive tests to verify core infrastructure implementation
 */

const { SLADigitalIntegration, operatorConfigs, apiConfig } = require('../src/index');

// Test configuration
const testConfig = {
  environment: 'sandbox',
  credentials: {
    username: 'test_username',
    password: 'test_password'
  }
};

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

class Phase1Tester {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  // ============= TEST UTILITIES =============

  assert(condition, testName, message) {
    if (condition) {
      this.passed++;
      console.log(`${colors.green}✓${colors.reset} ${testName}`);
      return true;
    } else {
      this.failed++;
      console.log(`${colors.red}✗${colors.reset} ${testName}: ${message}`);
      return false;
    }
  }

  logSection(title) {
    console.log(`\n${colors.cyan}${'='.repeat(50)}${colors.reset}`);
    console.log(`${colors.cyan}${title}${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(50)}${colors.reset}\n`);
  }

  // ============= CONFIGURATION TESTS =============

  testOperatorConfigurations() {
    this.logSection('Testing Operator Configurations');
    
    // Test all operators are configured
    const expectedOperators = [
      'vodafone-uk', 'three-uk', 'o2-uk', 'ee-uk',
      'telenor-mm', 'telenor-dk', 'telenor-no', 'telenor-se', 'telenor-digi', 'telenor-rs',
      'zain-kw', 'zain-sa', 'zain-bh', 'zain-jo', 'zain-iq', 'zain-sd',
      'axiata-lk', 'mobily-sa', 'ooredoo-kw', 'stc-kw', 'etisalat-ae',
      '9mobile-ng', 'movitel-mz', 'three-ie', 'vodafone-ie', 'umobile-my'
    ];

    expectedOperators.forEach(operator => {
      this.assert(
        operatorConfigs[operator] !== undefined,
        `Operator ${operator} configured`,
        `Missing configuration for ${operator}`
      );
    });

    // Test UK operators configuration
    this.assert(
      operatorConfigs['vodafone-uk'].asyncResponse === true,
      'UK operators have async response',
      'UK operators should have asyncResponse=true'
    );

    this.assert(
      operatorConfigs['vodafone-uk'].requiresCorrelator === true,
      'UK operators require correlator',
      'UK operators should require correlator'
    );

    // Test Telenor ACR configuration
    this.assert(
      operatorConfigs['telenor-mm'].usesACR === true,
      'Telenor uses ACR',
      'Telenor should use ACR'
    );

    this.assert(
      operatorConfigs['telenor-mm'].acrLength === 48,
      'Telenor ACR length is 48',
      'Telenor ACR should be 48 characters'
    );

    // Test Zain configurations
    this.assert(
      operatorConfigs['zain-kw'].statusResponse === 'SUCCESS',
      'Zain KW returns SUCCESS status',
      'Zain KW should return SUCCESS instead of CHARGED'
    );

    this.assert(
      operatorConfigs['zain-kw'].checkoutUrl === 'http://msisdn.sla-alacrity.com/purchase',
      'Zain uses special checkout URL',
      'Zain should use msisdn.sla-alacrity.com'
    );

    this.assert(
      operatorConfigs['zain-kw'].pinLength === 4,
      'Zain KW PIN length is 4',
      'Zain KW should have 4-digit PIN'
    );

    // Test special operators
    this.assert(
      operatorConfigs['mobily-sa'].requiresFraudToken === true,
      'Mobily requires fraud token',
      'Mobily KSA should require fraud token'
    );

    this.assert(
      operatorConfigs['axiata-lk'].noTrialSupport === true,
      'Axiata has no trial support',
      'Axiata should not support free trials'
    );

    this.assert(
      operatorConfigs['etisalat-ae'].noLandingPage === true,
      'Etisalat UAE requires direct checkout',
      'Etisalat UAE should not allow landing pages'
    );
  }

  // ============= API CONFIGURATION TESTS =============

  testAPIConfiguration() {
    this.logSection('Testing API Configuration');

    // Test environments
    this.assert(
      apiConfig.environments.sandbox !== undefined,
      'Sandbox environment configured',
      'Sandbox environment missing'
    );

    this.assert(
      apiConfig.environments.production !== undefined,
      'Production environment configured',
      'Production environment missing'
    );

    this.assert(
      apiConfig.environments.sandbox.pinValue === '000000',
      'Sandbox uses fixed PIN',
      'Sandbox should use PIN 000000'
    );

    // Test endpoints
    this.assert(
      apiConfig.endpoints.subscription.create === '/v2.2/subscription/create',
      'Subscription create endpoint correct',
      'Wrong subscription create endpoint'
    );

    this.assert(
      apiConfig.endpoints.billing.charge === '/v2.2/charge',
      'Charge endpoint correct',
      'Wrong charge endpoint'
    );

    this.assert(
      apiConfig.endpoints.pin.generate === '/v2.2/pin',
      'PIN endpoint correct',
      'Wrong PIN endpoint'
    );

    // Test HTTP configuration
    this.assert(
      apiConfig.http.method === 'POST',
      'All requests use POST',
      'All SLA API calls should use POST'
    );

    this.assert(
      apiConfig.http.timeout === 30000,
      'Timeout set to 30 seconds',
      'Timeout should be 30000ms'
    );

    // Test error categories
    this.assert(
      apiConfig.errorCategories['PIN API']['3002'] === 'PIN expired',
      'Error codes configured',
      'Error code 3002 should be PIN expired'
    );
  }

  // ============= CLIENT INSTANTIATION TESTS =============

  testClientInstantiation() {
    this.logSection('Testing Client Instantiation');

    try {
      // Set dummy credentials for testing
      process.env.SANDBOX_API_USERNAME = 'test_user';
      process.env.SANDBOX_API_PASSWORD = 'test_pass';

      const integration = new SLADigitalIntegration('sandbox');
      
      this.assert(
        integration !== undefined,
        'Client instantiation successful',
        'Failed to instantiate client'
      );

      this.assert(
        integration.environment === 'sandbox',
        'Environment set correctly',
        'Environment not set to sandbox'
      );

      this.assert(
        typeof integration.createSubscription === 'function',
        'createSubscription method exists',
        'createSubscription method missing'
      );

      this.assert(
        typeof integration.generatePIN === 'function',
        'generatePIN method exists',
        'generatePIN method missing'
      );

      this.assert(
        typeof integration.getCheckoutUrl === 'function',
        'getCheckoutUrl method exists',
        'getCheckoutUrl method missing'
      );

    } catch (error) {
      this.assert(false, 'Client instantiation', error.message);
    }
  }

  // ============= HELPER FUNCTION TESTS =============

  testHelperFunctions() {
    this.logSection('Testing Helper Functions');

    const integration = new SLADigitalIntegration('sandbox', testConfig);

    // Test getOperatorsByCountry
    const ukOperators = integration.getOperatorsByCountry('United Kingdom');
    this.assert(
      ukOperators.length === 4,
      'getOperatorsByCountry returns correct count',
      'Should return 4 UK operators'
    );

    // Test getOperatorsByFlow
    const checkoutOnlyOperators = integration.getOperatorsByFlow('checkout_only');
    this.assert(
      checkoutOnlyOperators.length > 0,
      'getOperatorsByFlow returns operators',
      'Should return checkout_only operators'
    );

    // Test supportsPINAPI
    this.assert(
      integration.supportsPINAPI('zain-bh') === true,
      'supportsPINAPI correct for Zain Bahrain',
      'Zain Bahrain should support PIN API'
    );

    this.assert(
      integration.supportsPINAPI('vodafone-uk') === false,
      'supportsPINAPI correct for UK operators',
      'UK operators should not support PIN API'
    );

    // Test getSupportedOperators
    const supportedOperators = integration.getSupportedOperators();
    this.assert(
      supportedOperators.length > 25,
      'All operators listed',
      'Should have more than 25 operators'
    );
  }

  // ============= CHECKOUT URL TESTS =============

  testCheckoutURLGeneration() {
    this.logSection('Testing Checkout URL Generation');

    const integration = new SLADigitalIntegration('sandbox', testConfig);

    // Test standard checkout URL
    const standardUrl = integration.getCheckoutUrl('9mobile-ng', {
      merchant: 'partner:test',
      campaign: 'campaign:test',
      redirect_url: 'http://test.com'
    });

    this.assert(
      standardUrl.includes('checkout-sandbox.sla-alacrity.com'),
      'Sandbox checkout URL used',
      'Should use sandbox checkout URL'
    );

    // Test Zain checkout URL
    const zainUrl = integration.getCheckoutUrl('zain-kw', {
      merchant: 'partner:test',
      campaign: 'campaign:test',
      redirect_url: 'http://test.com'
    });

    this.assert(
      zainUrl.includes('msisdn.sla-alacrity.com'),
      'Zain uses special checkout URL',
      'Zain should use msisdn.sla-alacrity.com'
    );

    // Test URL contains required parameters
    this.assert(
      standardUrl.includes('merchant=') && standardUrl.includes('service='),
      'Checkout URL contains required params',
      'Checkout URL should contain merchant and service'
    );
  }

  // ============= RESPONSE HANDLER TESTS =============

  testResponseHandler() {
    this.logSection('Testing Response Handler');

    const integration = new SLADigitalIntegration('sandbox', testConfig);

    // Test success response processing
    const successResponse = {
      success: {
        type: 'subscription',
        uuid: 'test-uuid',
        msisdn: '965XXXXXXXX',
        transaction: {
          status: 'CHARGED'
        }
      }
    };

    const processed = integration.responseHandler.processResponse(successResponse, 'zain-kw', 'subscription');
    
    this.assert(
      processed.success === true,
      'Success response processed',
      'Should process success response'
    );

    // Test Telenor ACR response
    const acrResponse = {
      success: {
        type: 'subscription',
        uuid: 'test-uuid',
        msisdn: 'telenor-TLN-MM:XXXPbCyj3lJNj4mBCIBR2iaYYYYYYYY'
      }
    };

    const acrProcessed = integration.responseHandler.processResponse(acrResponse, 'telenor-mm', 'subscription');
    
    this.assert(
      acrProcessed.hasACR === true,
      'ACR detected in response',
      'Should detect ACR in Telenor response'
    );

    // Test error response
    const errorResponse = {
      error: {
        category: 'PIN API',
        code: '3002',
        message: 'PIN expired'
      }
    };

    const errorProcessed = integration.responseHandler.processResponse(errorResponse, 'zain-kw', 'pin');
    
    this.assert(
      errorProcessed.success === false,
      'Error response processed',
      'Should process error response'
    );

    this.assert(
      errorProcessed.error.isRetryable === true,
      'PIN expired is retryable',
      'PIN expired should be marked as retryable'
    );
  }

  // ============= RUN ALL TESTS =============

  async runAllTests() {
    console.log(`\n${colors.blue}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.blue}PHASE 1 VERIFICATION - CORE INFRASTRUCTURE${colors.reset}`);
    console.log(`${colors.blue}${'='.repeat(60)}${colors.reset}`);

    this.testOperatorConfigurations();
    this.testAPIConfiguration();
    this.testClientInstantiation();
    this.testHelperFunctions();
    this.testCheckoutURLGeneration();
    this.testResponseHandler();

    // Summary
    console.log(`\n${colors.cyan}${'='.repeat(50)}${colors.reset}`);
    console.log(`${colors.cyan}TEST SUMMARY${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(50)}${colors.reset}\n`);
    
    console.log(`${colors.green}Passed: ${this.passed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${this.failed}${colors.reset}`);
    
    const successRate = ((this.passed / (this.passed + this.failed)) * 100).toFixed(2);
    const color = successRate === '100.00' ? colors.green : colors.yellow;
    console.log(`${color}Success Rate: ${successRate}%${colors.reset}\n`);

    if (this.failed === 0) {
      console.log(`${colors.green}✓ PHASE 1 IMPLEMENTATION VERIFIED SUCCESSFULLY!${colors.reset}\n`);
    } else {
      console.log(`${colors.red}✗ PHASE 1 IMPLEMENTATION HAS ISSUES!${colors.reset}\n`);
    }
  }
}

// Run tests
const tester = new Phase1Tester();
tester.runAllTests();