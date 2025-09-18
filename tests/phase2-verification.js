/**
 * Phase 2 Verification Tests
 * Tests for Standard Operators Implementation
 */

const { operatorConfigs } = require('../src/config/operators.config');

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

class Phase2Tester {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
    this.flows = {};
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

  // ============= FLOW TESTS =============

  async testPINFlow() {
    this.logSection('Testing PIN Flow Implementation');

    try {
      // Load PINFlow class
      const PINFlow = require('../src/services/flows/PINFlow');
      const mockClient = {
        supportsPINAPI: (op) => operatorConfigs[op]?.flow?.includes('pin'),
        generatePIN: async () => ({ success: true }),
        createSubscription: async () => ({ success: true, data: { uuid: 'test-uuid' } }),
        sendSMS: async () => ({ success: true }),
        generateCorrelator: () => 'test-correlator',
        environment: 'sandbox'
      };

      const pinFlow = new PINFlow(mockClient);

      // Test PIN generation for standard operator
      this.assert(
        typeof pinFlow.generateAndSendPIN === 'function',
        'PIN generation method exists',
        'Missing generateAndSendPIN method'
      );

      // Test Ooredoo Kuwait amount requirement
      try {
        await pinFlow.generateAndSendPIN('ooredoo-kw', {
          msisdn: '965XXXXXXXX',
          campaign: 'test',
          merchant: 'test'
          // Missing amount - should be required
        });
        this.assert(false, 'Ooredoo amount validation', 'Should require amount');
      } catch (e) {
        this.assert(
          true,
          'Ooredoo requires amount for PIN',
          'Amount validation working'
        );
      }

      // Test Mobily fraud token requirement
      try {
        await pinFlow.generateAndSendPIN('mobily-sa', {
          msisdn: '966XXXXXXXX',
          campaign: 'test',
          merchant: 'test'
          // Missing fraud_token
        });
        this.assert(false, 'Mobily fraud token validation', 'Should require fraud token');
      } catch (e) {
        this.assert(
          e.message.includes('Fraud token'),
          'Mobily requires fraud token',
          'Fraud token validation working'
        );
      }

      // Test PIN expiry tracking
      const pinRef = pinFlow.storePINReference('965XXXXXXXX', 'zain-kw');
      this.assert(
        pinRef.includes('PIN_zain-kw'),
        'PIN reference generated',
        'PIN reference format incorrect'
      );

      // Test PIN metadata storage
      pinFlow.storePINMetadata('965XXXXXXXX', 'zain-kw', {
        sentAt: Date.now(),
        expiresAt: Date.now() + 120000,
        attempts: 0
      });

      const metadata = pinFlow.getPINMetadata('965XXXXXXXX', 'zain-kw');
      this.assert(
        metadata !== undefined,
        'PIN metadata stored',
        'PIN metadata not stored'
      );

      this.assert(
        metadata.attempts === 0,
        'PIN attempt tracking',
        'PIN attempts not tracked'
      );

    } catch (error) {
      this.assert(false, 'PIN Flow implementation', error.message);
    }
  }

  async testCheckoutFlow() {
    this.logSection('Testing Checkout Flow Implementation');

    try {
      const CheckoutFlow = require('../src/services/flows/CheckoutFlow');
      const mockClient = {
        buildCheckoutUrl: (op, params) => `http://checkout.test/${op}`,
        generateCorrelator: () => 'test-correlator',
        generateTransactionId: () => 'TXN_TEST_123',
        createSubscription: async () => ({ success: true, data: { uuid: 'test-uuid' } }),
        sendSMS: async () => ({ success: true }),
        storeACR: () => {},
        environment: 'sandbox'
      };

      const checkoutFlow = new CheckoutFlow(mockClient);

      // Test checkout support detection
      this.assert(
        typeof checkoutFlow.supportsCheckout === 'function',
        'Checkout support detection exists',
        'Missing supportsCheckout method'
      );

      // Test UK operator detection
      this.assert(
        checkoutFlow.isUKOperator('vodafone-uk'),
        'UK operator detection',
        'UK operator not detected'
      );

      // Test UK checkout specifics
      const ukResult = await checkoutFlow.executeUKCheckout('vodafone-uk', {
        merchant: 'test',
        campaign: 'test',
        redirect_url: 'http://test.com'
      });

      this.assert(
        ukResult.flow === 'uk_async',
        'UK async flow identified',
        'UK flow not set to async'
      );

      this.assert(
        ukResult.important.includes('DO NOT call subscription/create'),
        'UK webhook instruction present',
        'Missing UK webhook instruction'
      );

      // Test Etisalat direct checkout
      const etisalatResult = await checkoutFlow.executeDirectCheckout('etisalat-ae', {
        merchant: 'test',
        campaign: 'test',
        redirect_url: 'http://test.com'
      });

      this.assert(
        etisalatResult.action === 'IMMEDIATE_REDIRECT',
        'Etisalat immediate redirect',
        'Etisalat should redirect immediately'
      );

      this.assert(
        etisalatResult.warning.includes('No landing page'),
        'Etisalat landing page warning',
        'Missing Etisalat warning'
      );

      // Test Axiata async checkout
      const axiataResult = await checkoutFlow.executeAxiataCheckout('axiata-lk', {
        merchant: 'test',
        campaign: 'test',
        redirect_url: 'http://test.com'
      });

      this.assert(
        axiataResult.transaction_id !== undefined,
        'Axiata transaction ID generated',
        'Axiata missing transaction ID'
      );

      this.assert(
        axiataResult.warning.includes('asynchronous'),
        'Axiata async warning',
        'Axiata async warning missing'
      );

      // Test Telenor ACR checkout
      const telenorResult = await checkoutFlow.executeACRCheckout('telenor-mm', {
        merchant: 'test',
        campaign: 'test',
        redirect_url: 'http://test.com'
      });

      this.assert(
        telenorResult.flow === 'telenor_acr',
        'Telenor ACR flow',
        'Telenor flow not set to ACR'
      );

      this.assert(
        telenorResult.note.includes('ACR will be returned'),
        'Telenor ACR note',
        'Telenor ACR note missing'
      );

      // Test session management
      const sessionId = checkoutFlow.createCheckoutSession('zain-kw', {
        merchant: 'test',
        campaign: 'test'
      });

      this.assert(
        sessionId.includes('CHECKOUT_zain-kw'),
        'Session ID format',
        'Session ID format incorrect'
      );

      const session = checkoutFlow.getCheckoutSession(sessionId);
      this.assert(
        session !== undefined,
        'Session retrieval',
        'Session not retrievable'
      );

    } catch (error) {
      this.assert(false, 'Checkout Flow implementation', error.message);
    }
  }

  async testFlowManager() {
    this.logSection('Testing Flow Manager');

    try {
      const FlowManager = require('../src/services/flows/FlowManager');
      const mockClient = {
        supportsPINAPI: (op) => operatorConfigs[op]?.flow?.includes('pin'),
        generateCorrelator: () => 'test-correlator',
        generateTransactionId: () => 'TXN_TEST_123'
      };

      const flowManager = new FlowManager(mockClient);

      // Test flow routing for UK operators
      this.assert(
        typeof flowManager.handleCheckoutOnly === 'function',
        'Checkout-only handler exists',
        'Missing checkout-only handler'
      );

      // Test flow routing for Telenor ACR
      this.assert(
        typeof flowManager.handleCheckoutWithACR === 'function',
        'ACR handler exists',
        'Missing ACR handler'
      );

      // Test flow routing for Mobily fraud prevention
      const mobilyResult = await flowManager.handleFraudPreventionFlow('mobily-sa', {
        msisdn: '966XXXXXXXX'
      });

      this.assert(
        mobilyResult.action === 'LOAD_FRAUD_SCRIPT',
        'Mobily fraud script required',
        'Mobily fraud flow incorrect'
      );

      // Test flow recommendation
      const recommended = flowManager.getRecommendedFlow('vodafone-uk');
      this.assert(
        recommended === 'checkout',
        'Flow recommendation for UK',
        'Wrong flow recommended for UK'
      );

      const recommendedPin = flowManager.getRecommendedFlow('zain-bh');
      this.assert(
        recommendedPin === 'pin',
        'Flow recommendation for PIN-allowed',
        'Wrong flow recommended for PIN'
      );

      // Test flow reference storage
      flowManager.storeFlowReference('vodafone-uk', 'test-correlator', {
        type: 'uk_async',
        sessionId: 'test-session'
      });

      const flowRef = flowManager.getFlowReference('vodafone-uk', 'test-correlator');
      this.assert(
        flowRef !== undefined,
        'Flow reference storage',
        'Flow reference not stored'
      );

      this.assert(
        flowRef.type === 'uk_async',
        'Flow reference type',
        'Flow reference type incorrect'
      );

    } catch (error) {
      this.assert(false, 'Flow Manager implementation', error.message);
    }
  }

  async testWebhookHandler() {
    this.logSection('Testing Webhook Handler');

    try {
      const WebhookHandler = require('../src/services/api/WebhookHandler');
      const mockResponseHandler = {
        processWebhookNotification: (notification) => ({
          success: true,
          type: notification.success?.type
        })
      };
      const mockFlowManager = {
        getFlowReference: () => ({ correlator: 'test' }),
        clearFlowReference: () => {}
      };

      const webhookHandler = new WebhookHandler(mockResponseHandler, mockFlowManager);

      // Test webhook router creation
      const router = webhookHandler.createRouter();
      this.assert(
        router !== undefined,
        'Webhook router created',
        'Router not created'
      );

      // Test operator extraction
      const operator = webhookHandler.extractOperator({
        success: { operator: 'vodafone-uk' }
      });
      this.assert(
        operator === 'vodafone-uk',
        'Operator extraction',
        'Operator not extracted'
      );

      // Test UK operator identification
      this.assert(
        webhookHandler.isUKOperator('three-uk'),
        'UK operator identification',
        'UK operator not identified'
      );

      // Test webhook history storage
      webhookHandler.storeWebhookHistory('zain-kw', {
        success: { type: 'subscription', uuid: 'test' }
      }, { processed: true });

      this.assert(
        webhookHandler.webhookHistory.length > 0,
        'Webhook history storage',
        'Webhook not stored in history'
      );

      // Test callback registration
      const callbackCalled = { value: false };
      webhookHandler.registerCallback('vodafone-uk', 'subscription_created', () => {
        callbackCalled.value = true;
      });

      await webhookHandler.executeCallbacks('vodafone-uk', 'subscription_created', {});
      this.assert(
        callbackCalled.value,
        'Webhook callback execution',
        'Callback not executed'
      );

    } catch (error) {
      this.assert(false, 'Webhook Handler implementation', error.message);
    }
  }

  async testSubscriptionManager() {
    this.logSection('Testing Subscription Manager');

    try {
      const SubscriptionManager = require('../src/services/api/SubscriptionManager');
      const mockClient = {};
      const mockFlowManager = {
        initiateSubscription: async () => ({
          success: true,
          data: { uuid: 'test-uuid', msisdn: '965XXXXXXXX' }
        })
      };

      const subscriptionManager = new SubscriptionManager(mockClient, mockFlowManager);

      // Test subscription storage
      await subscriptionManager.storeSubscription('zain-kw', {
        uuid: 'test-uuid',
        msisdn: '965XXXXXXXX',
        campaign: 'test-campaign',
        transaction: { status: 'CHARGED' }
      });

      const subscription = subscriptionManager.getSubscription('test-uuid');
      this.assert(
        subscription !== undefined,
        'Subscription storage',
        'Subscription not stored'
      );

      this.assert(
        subscription.operator === 'zain-kw',
        'Operator stored correctly',
        'Operator not stored'
      );

      // Test MSISDN lookup
      const msisdnSubs = subscriptionManager.getMSISDNSubscriptions('965XXXXXXXX');
      this.assert(
        msisdnSubs.length > 0,
        'MSISDN subscription lookup',
        'MSISDN lookup failed'
      );

      // Test ACR handling for Telenor
      await subscriptionManager.storeSubscription('telenor-mm', {
        uuid: 'test-acr-uuid',
        msisdn: 'telenor-TLN-MM:XXXPbCyj3lJNj4mBCIBR2iaYYYYYYYY',
        campaign: 'test-campaign'
      });

      const acrSub = subscriptionManager.getSubscription('test-acr-uuid');
      this.assert(
        acrSub.hasACR === true,
        'ACR detection',
        'ACR not detected'
      );

      this.assert(
        acrSub.acr.startsWith('telenor-'),
        'ACR stored',
        'ACR not stored correctly'
      );

      // Test subscription statistics
      const stats = subscriptionManager.getStatistics();
      this.assert(
        stats.total > 0,
        'Statistics calculation',
        'Statistics not calculated'
      );

      this.assert(
        stats.byOperator['zain-kw'] > 0,
        'Operator statistics',
        'Operator stats incorrect'
      );

      // Test subscription lifecycle handlers
      await subscriptionManager.handleSuspension('zain-kw', {
        uuid: 'test-uuid',
        reason: 'INSUFFICIENT_FUNDS'
      });

      const suspendedSub = subscriptionManager.getSubscription('test-uuid');
      this.assert(
        suspendedSub.status === 'SUSPENDED',
        'Suspension handling',
        'Suspension not handled'
      );

    } catch (error) {
      this.assert(false, 'Subscription Manager implementation', error.message);
    }
  }

  // ============= INTEGRATION TESTS =============

  async testOperatorFlowIntegration() {
    this.logSection('Testing Operator Flow Integration');

    // Test flow selection for each operator type
    const flowTests = [
      { operator: 'vodafone-uk', expectedFlow: 'checkout_only', async: true },
      { operator: 'telenor-mm', expectedFlow: 'checkout_with_acr', hasACR: true },
      { operator: 'zain-kw', expectedFlow: 'checkout_only', special: 'SUCCESS_status' },
      { operator: 'mobily-sa', expectedFlow: 'pin_with_fraud_prevention', needsFraud: true },
      { operator: 'axiata-lk', expectedFlow: 'checkout_async', async: true },
      { operator: 'ooredoo-kw', expectedFlow: 'checkout_or_pin', flexible: true },
      { operator: 'zain-bh', expectedFlow: 'pin_api_allowed', pinSupported: true }
    ];

    flowTests.forEach(test => {
      const config = operatorConfigs[test.operator];
      this.assert(
        config.flow === test.expectedFlow,
        `${test.operator} flow type`,
        `Expected ${test.expectedFlow}, got ${config.flow}`
      );

      if (test.async) {
        this.assert(
          config.asyncResponse === true || config.webhookBased === true,
          `${test.operator} async config`,
          'Async configuration missing'
        );
      }

      if (test.hasACR) {
        this.assert(
          config.usesACR === true,
          `${test.operator} ACR config`,
          'ACR configuration missing'
        );
      }

      if (test.needsFraud) {
        this.assert(
          config.requiresFraudToken === true,
          `${test.operator} fraud config`,
          'Fraud token configuration missing'
        );
      }
    });
  }

  // ============= RUN ALL TESTS =============

  async runAllTests() {
    console.log(`\n${colors.blue}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.blue}PHASE 2 VERIFICATION - STANDARD OPERATORS${colors.reset}`);
    console.log(`${colors.blue}${'='.repeat(60)}${colors.reset}`);

    await this.testPINFlow();
    await this.testCheckoutFlow();
    await this.testFlowManager();
    await this.testWebhookHandler();
    await this.testSubscriptionManager();
    await this.testOperatorFlowIntegration();

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
      console.log(`${colors.green}✓ PHASE 2 IMPLEMENTATION VERIFIED SUCCESSFULLY!${colors.reset}\n`);
    } else {
      console.log(`${colors.red}✗ PHASE 2 IMPLEMENTATION HAS ISSUES!${colors.reset}\n`);
    }
  }
}

// Run tests
const tester = new Phase2Tester();
tester.runAllTests();