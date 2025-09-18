/**
 * Comprehensive Integration Test
 * Tests all 3 phases together to ensure complete system integration
 */

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

class ComprehensiveIntegrationTest {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.phases = {
      phase1: { passed: 0, failed: 0, tests: [] },
      phase2: { passed: 0, failed: 0, tests: [] },
      phase3: { passed: 0, failed: 0, tests: [] }
    };
  }

  assert(condition, phase, testName, message) {
    const result = {
      testName,
      passed: condition,
      message: condition ? 'Passed' : message
    };

    this.phases[phase].tests.push(result);

    if (condition) {
      this.passed++;
      this.phases[phase].passed++;
      console.log(`  ${colors.green}✓${colors.reset} ${testName}`);
      return true;
    } else {
      this.failed++;
      this.phases[phase].failed++;
      console.log(`  ${colors.red}✗${colors.reset} ${testName}: ${message}`);
      return false;
    }
  }

  logPhase(phase, title) {
    console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.cyan}${phase.toUpperCase()}: ${title}${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
  }

  logSection(title) {
    console.log(`\n${colors.magenta}${title}${colors.reset}`);
    console.log(`${colors.magenta}${'-'.repeat(40)}${colors.reset}`);
  }

  // ============= PHASE 1 TESTS: CORE INFRASTRUCTURE =============

  async testPhase1() {
    this.logPhase('phase1', 'CORE INFRASTRUCTURE');

    // Test configurations
    this.logSection('Operator Configuration');
    const { operatorConfigs } = require('../src/config/operators.config');
    
    // Test critical operators
    const criticalOperators = [
      'vodafone-uk', 'telenor-mm', 'zain-kw', 'mobily-sa', 
      'axiata-lk', 'etisalat-ae', 'ooredoo-kw'
    ];

    criticalOperators.forEach(op => {
      this.assert(
        operatorConfigs[op] !== undefined,
        'phase1',
        `Operator ${op} configured`,
        `Missing configuration for ${op}`
      );
    });

    // Test API configuration
    this.logSection('API Configuration');
    const { apiConfig } = require('../src/config/api.config');
    
    this.assert(
      apiConfig.version === 'v2.2',
      'phase1',
      'API version correct',
      'Wrong API version'
    );

    this.assert(
      apiConfig.http.method === 'POST',
      'phase1',
      'HTTP method is POST',
      'All requests must use POST'
    );

    this.assert(
      apiConfig.endpoints.subscription.create === '/v2.2/subscription/create',
      'phase1',
      'Subscription endpoint correct',
      'Wrong subscription endpoint'
    );

    // Test Core Client
    this.logSection('Core SLA Client');
    const SLAClient = require('../src/services/core/SLAClient');
    
    try {
      const client = new SLAClient('sandbox', {
        username: 'test',
        password: 'test'
      });
      
      this.assert(
        client !== undefined,
        'phase1',
        'SLA Client instantiation',
        'Failed to create client'
      );

      this.assert(
        typeof client.buildQueryString === 'function',
        'phase1',
        'Query string builder exists',
        'Missing query string builder'
      );

      this.assert(
        typeof client.generateCorrelator === 'function',
        'phase1',
        'Correlator generator exists',
        'Missing correlator generator'
      );

    } catch (error) {
      this.assert(false, 'phase1', 'SLA Client creation', error.message);
    }

    // Test Response Handler
    this.logSection('Response Handler');
    const ResponseHandler = require('../src/services/core/ResponseHandler');
    const responseHandler = new ResponseHandler();

    // Test Zain SUCCESS status conversion
    const zainResponse = {
      success: {
        transaction: { status: 'SUCCESS' }
      }
    };

    const processed = responseHandler.processResponse(zainResponse, 'zain-kw', 'subscription');
    this.assert(
      processed.data.transaction.status === 'CHARGED',
      'phase1',
      'Zain SUCCESS status conversion',
      'SUCCESS not converted to CHARGED'
    );

    // Test ACR detection
    const acrResponse = {
      success: {
        msisdn: 'telenor-TLN-MM:XXXPbCyj3lJNj4mBCIBR2iaYYYYYYYY'
      }
    };

    const acrProcessed = responseHandler.processResponse(acrResponse, 'telenor-mm', 'subscription');
    this.assert(
      acrProcessed.hasACR === true,
      'phase1',
      'Telenor ACR detection',
      'ACR not detected'
    );
  }

  // ============= PHASE 2 TESTS: STANDARD OPERATORS =============

  async testPhase2() {
    this.logPhase('phase2', 'STANDARD OPERATORS');

    // Test PIN Flow
    this.logSection('PIN Flow');
    const PINFlow = require('../src/services/flows/PINFlow');
    const mockClient = {
      supportsPINAPI: () => true,
      generatePIN: async () => ({ success: true }),
      generateCorrelator: () => 'test-correlator',
      environment: 'sandbox'
    };

    const pinFlow = new PINFlow(mockClient);

    // Test Ooredoo amount requirement (FIXED)
    try {
      await pinFlow.generateAndSendPIN('ooredoo-kw', {
        msisdn: '965XXXXXXXX',
        campaign: 'test',
        merchant: 'test'
        // Missing amount
      });
      this.assert(false, 'phase2', 'Ooredoo amount validation', 'Should require amount');
    } catch (e) {
      this.assert(
        e.message.includes('Amount is required'),
        'phase2',
        'Ooredoo amount validation',
        'Amount validation not working'
      );
    }

    // Test Mobily fraud token
    try {
      await pinFlow.generateAndSendPIN('mobily-sa', {
        msisdn: '966XXXXXXXX',
        campaign: 'test',
        merchant: 'test'
      });
      this.assert(false, 'phase2', 'Mobily fraud validation', 'Should require fraud token');
    } catch (e) {
      this.assert(
        e.message.includes('Fraud token'),
        'phase2',
        'Mobily fraud validation',
        'Fraud token not required'
      );
    }

    // Test Checkout Flow
    this.logSection('Checkout Flow');
    const CheckoutFlow = require('../src/services/flows/CheckoutFlow');
    const checkoutClient = {
      buildCheckoutUrl: () => 'http://test.com',
      generateCorrelator: () => 'test-correlator',
      generateTransactionId: () => 'TXN_123'
    };

    const checkoutFlow = new CheckoutFlow(checkoutClient);

    // Test UK operator async
    const ukResult = await checkoutFlow.executeUKCheckout('vodafone-uk', {
      merchant: 'test',
      campaign: 'test',
      redirect_url: 'http://test.com'
    });

    this.assert(
      ukResult.flow === 'uk_async',
      'phase2',
      'UK async flow',
      'UK flow not async'
    );

    this.assert(
      ukResult.important.includes('DO NOT call'),
      'phase2',
      'UK webhook instruction',
      'Missing UK webhook warning'
    );

    // Test Etisalat direct checkout
    const etisalatResult = await checkoutFlow.executeDirectCheckout('etisalat-ae', {
      merchant: 'test',
      campaign: 'test',
      redirect_url: 'http://test.com'
    });

    this.assert(
      etisalatResult.action === 'IMMEDIATE_REDIRECT',
      'phase2',
      'Etisalat direct checkout',
      'Etisalat not immediate redirect'
    );

    // Test Flow Manager
    this.logSection('Flow Manager');
    const FlowManager = require('../src/services/flows/FlowManager');
    const flowManager = new FlowManager(mockClient);

    const mobilyResult = await flowManager.handleFraudPreventionFlow('mobily-sa', {
      msisdn: '966XXXXXXXX'
    });

    this.assert(
      mobilyResult.action === 'LOAD_FRAUD_SCRIPT',
      'phase2',
      'Mobily fraud script required',
      'Fraud script not required'
    );

    // Test Webhook Handler
    this.logSection('Webhook Handler');
    const WebhookHandler = require('../src/services/api/WebhookHandler');
    const mockResponseHandler = {
      processWebhookNotification: () => ({ success: true })
    };
    const mockFlowManager = {
      getFlowReference: () => null,
      clearFlowReference: () => {}
    };

    const webhookHandler = new WebhookHandler(mockResponseHandler, mockFlowManager);

    this.assert(
      webhookHandler.isUKOperator('three-uk'),
      'phase2',
      'UK operator identification',
      'UK operator not identified'
    );

    const operator = webhookHandler.extractOperator({
      success: { operator: 'zain-kw' }
    });

    this.assert(
      operator === 'zain-kw',
      'phase2',
      'Operator extraction',
      'Operator not extracted'
    );

    // Test Subscription Manager
    this.logSection('Subscription Manager');
    const SubscriptionManager = require('../src/services/api/SubscriptionManager');
    const subscriptionManager = new SubscriptionManager(mockClient, flowManager);

    await subscriptionManager.storeSubscription('telenor-mm', {
      uuid: 'test-uuid',
      msisdn: 'telenor-TLN-MM:XXXPbCyj3lJNj4mBCIBR2iaYYYYYYYY',
      campaign: 'test'
    });

    const sub = subscriptionManager.getSubscription('test-uuid');
    this.assert(
      sub.hasACR === true,
      'phase2',
      'ACR storage',
      'ACR not stored'
    );
  }

  // ============= PHASE 3 TESTS: INTEGRATION & SPECIAL CASES =============

  async testPhase3() {
    this.logPhase('phase3', 'INTEGRATION & SPECIAL CASES');

    // Test Complete Flow Integration
    this.logSection('End-to-End Flow Integration');
    
    const { operatorConfigs } = require('../src/config/operators.config');
    const FlowManager = require('../src/services/flows/FlowManager');
    
    // Test flow selection for each operator type
    const flowTests = [
      { operator: 'vodafone-uk', expectedFlow: 'checkout_only', feature: 'async' },
      { operator: 'telenor-mm', expectedFlow: 'checkout_with_acr', feature: 'ACR' },
      { operator: 'zain-kw', expectedFlow: 'checkout_only', feature: 'SUCCESS_status' },
      { operator: 'mobily-sa', expectedFlow: 'pin_with_fraud_prevention', feature: 'fraud' },
      { operator: 'axiata-lk', expectedFlow: 'checkout_async', feature: 'async' },
      { operator: 'ooredoo-kw', expectedFlow: 'checkout_or_pin', feature: 'flexible' },
      { operator: 'etisalat-ae', expectedFlow: 'checkout_only', feature: 'no_landing' }
    ];

    flowTests.forEach(test => {
      const config = operatorConfigs[test.operator];
      this.assert(
        config.flow === test.expectedFlow,
        'phase3',
        `${test.operator} flow routing`,
        `Expected ${test.expectedFlow}, got ${config.flow}`
      );
    });

    // Test Cross-Component Integration
    this.logSection('Cross-Component Integration');

    // Test UK operator complete flow
    const ukConfig = operatorConfigs['vodafone-uk'];
    this.assert(
      ukConfig.asyncResponse && ukConfig.webhookBased && ukConfig.noSMS,
      'phase3',
      'UK complete configuration',
      'UK config incomplete'
    );

    // Test Telenor ACR complete flow
    const telenorConfig = operatorConfigs['telenor-mm'];
    this.assert(
      telenorConfig.usesACR && telenorConfig.acrLength === 48 && telenorConfig.requiresCorrelator,
      'phase3',
      'Telenor complete configuration',
      'Telenor config incomplete'
    );

    // Test Zain special requirements
    const zainKwConfig = operatorConfigs['zain-kw'];
    this.assert(
      zainKwConfig.checkoutUrl === 'http://msisdn.sla-alacrity.com/purchase' &&
      zainKwConfig.statusResponse === 'SUCCESS' &&
      zainKwConfig.pinLength === 4,
      'phase3',
      'Zain KW special requirements',
      'Zain KW config incomplete'
    );

    // Test Mobily fraud prevention
    const mobilyConfig = operatorConfigs['mobily-sa'];
    this.assert(
      mobilyConfig.requiresFraudToken && mobilyConfig.dualPageIntegration && mobilyConfig.noDeleteAPI,
      'phase3',
      'Mobily complete configuration',
      'Mobily config incomplete'
    );

    // Test Error Handling Integration
    this.logSection('Error Handling');
    const ResponseHandler = require('../src/services/core/ResponseHandler');
    const responseHandler = new ResponseHandler();

    const errorResponse = {
      error: {
        category: 'PIN API',
        code: '3002',
        message: 'PIN expired'
      }
    };

    const errorProcessed = responseHandler.processResponse(errorResponse, 'zain-kw', 'pin');
    this.assert(
      errorProcessed.error.isRetryable === true,
      'phase3',
      'Retryable error detection',
      'PIN expiry should be retryable'
    );

    // Test Session Management
    this.logSection('Session Management');
    const CheckoutFlow = require('../src/services/flows/CheckoutFlow');
    const checkoutFlow = new CheckoutFlow({
      buildCheckoutUrl: () => 'http://test.com'
    });

    const sessionId = checkoutFlow.createCheckoutSession('axiata-lk', {
      transaction_id: 'TXN_TEST'
    });

    this.assert(
      sessionId.includes('CHECKOUT_axiata-lk'),
      'phase3',
      'Session creation',
      'Session format incorrect'
    );

    const session = checkoutFlow.getCheckoutSession(sessionId);
    this.assert(
      session !== undefined && session.transaction_id === 'TXN_TEST',
      'phase3',
      'Session retrieval',
      'Session data not retrieved'
    );

    // Test Webhook Processing Integration
    this.logSection('Webhook Processing');
    const WebhookHandler = require('../src/services/api/WebhookHandler');
    
    // Test callback system
    const callbackExecuted = { value: false };
    const webhookHandler = new WebhookHandler(
      { processWebhookNotification: () => ({ success: true }) },
      { getFlowReference: () => null, clearFlowReference: () => {} }
    );

    webhookHandler.registerCallback('zain-kw', 'subscription_suspended', () => {
      callbackExecuted.value = true;
    });

    await webhookHandler.executeCallbacks('zain-kw', 'subscription_suspended', {});
    this.assert(
      callbackExecuted.value,
      'phase3',
      'Webhook callback system',
      'Callback not executed'
    );

    // Test Statistics
    this.logSection('System Statistics');
    const SubscriptionManager = require('../src/services/api/SubscriptionManager');
    const subscriptionManager = new SubscriptionManager({}, {});

    await subscriptionManager.storeSubscription('vodafone-uk', {
      uuid: 'uk-test',
      msisdn: '44XXXXXXXXX',
      campaign: 'test'
    });

    const stats = subscriptionManager.getStatistics();
    this.assert(
      stats.total > 0 && stats.byOperator['vodafone-uk'] > 0,
      'phase3',
      'Statistics generation',
      'Statistics not generated'
    );
  }

  // ============= CRITICAL PATH TESTS =============

  async testCriticalPaths() {
    this.logPhase('critical', 'CRITICAL PATH VALIDATION');

    this.logSection('UK Operator Critical Path');
    // UK: Checkout -> Webhook -> Subscription Created
    const { operatorConfigs } = require('../src/config/operators.config');
    
    this.assert(
      operatorConfigs['vodafone-uk'].webhookBased === true,
      'phase3',
      'UK webhook-based subscription',
      'UK must be webhook-based'
    );

    this.logSection('Telenor ACR Critical Path');
    // Telenor: Checkout -> Token -> Create with ACR
    this.assert(
      operatorConfigs['telenor-mm'].identifierFormat !== undefined,
      'phase3',
      'Telenor ACR format defined',
      'ACR format missing'
    );

    this.logSection('Zain Critical Path');
    // Zain: Special URL + SUCCESS status
    this.assert(
      operatorConfigs['zain-kw'].checkoutUrl.includes('msisdn'),
      'phase3',
      'Zain special URL',
      'Zain URL incorrect'
    );

    this.logSection('Mobily Critical Path');
    // Mobily: Fraud Token -> PIN -> Subscription
    this.assert(
      operatorConfigs['mobily-sa'].flow === 'pin_with_fraud_prevention',
      'phase3',
      'Mobily fraud flow',
      'Mobily flow incorrect'
    );

    this.logSection('Axiata Critical Path');
    // Axiata: Transaction ID -> Async Notification
    this.assert(
      operatorConfigs['axiata-lk'].requiresTransactionId === true,
      'phase3',
      'Axiata transaction ID',
      'Axiata missing transaction ID requirement'
    );
  }

  // ============= RUN ALL TESTS =============

  async runAllTests() {
    console.log(`\n${colors.blue}${'='.repeat(70)}${colors.reset}`);
    console.log(`${colors.blue}      COMPREHENSIVE INTEGRATION TEST - ALL PHASES${colors.reset}`);
    console.log(`${colors.blue}${'='.repeat(70)}${colors.reset}`);

    // Run all phases
    await this.testPhase1();
    await this.testPhase2();
    await this.testPhase3();
    await this.testCriticalPaths();

    // Generate summary
    console.log(`\n${colors.cyan}${'='.repeat(70)}${colors.reset}`);
    console.log(`${colors.cyan}                    COMPREHENSIVE TEST SUMMARY${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(70)}${colors.reset}\n`);

    // Phase summaries
    Object.entries(this.phases).forEach(([phase, results]) => {
      const successRate = results.tests.length > 0 
        ? ((results.passed / results.tests.length) * 100).toFixed(1)
        : '0';
      
      const color = successRate === '100.0' ? colors.green : colors.yellow;
      
      console.log(`${colors.magenta}${phase.toUpperCase()}:${colors.reset}`);
      console.log(`  Passed: ${colors.green}${results.passed}${colors.reset}`);
      console.log(`  Failed: ${colors.red}${results.failed}${colors.reset}`);
      console.log(`  Success Rate: ${color}${successRate}%${colors.reset}\n`);
    });

    // Overall summary
    console.log(`${colors.cyan}${'='.repeat(70)}${colors.reset}`);
    console.log(`${colors.cyan}OVERALL RESULTS:${colors.reset}`);
    console.log(`  Total Tests: ${this.passed + this.failed}`);
    console.log(`  ${colors.green}Passed: ${this.passed}${colors.reset}`);
    console.log(`  ${colors.red}Failed: ${this.failed}${colors.reset}`);
    
    const overallRate = ((this.passed / (this.passed + this.failed)) * 100).toFixed(2);
    const finalColor = overallRate === '100.00' ? colors.green : colors.yellow;
    console.log(`  ${finalColor}Success Rate: ${overallRate}%${colors.reset}\n`);

    if (this.failed === 0) {
      console.log(`${colors.green}${'='.repeat(70)}${colors.reset}`);
      console.log(`${colors.green}     ✓ ALL PHASES VERIFIED SUCCESSFULLY!${colors.reset}`);
      console.log(`${colors.green}     SYSTEM READY FOR PRODUCTION DEPLOYMENT${colors.reset}`);
      console.log(`${colors.green}${'='.repeat(70)}${colors.reset}\n`);
    } else {
      console.log(`${colors.red}${'='.repeat(70)}${colors.reset}`);
      console.log(`${colors.red}     ✗ INTEGRATION TEST FAILED${colors.reset}`);
      console.log(`${colors.red}     Please review failed tests above${colors.reset}`);
      console.log(`${colors.red}${'='.repeat(70)}${colors.reset}\n`);

      // Show failed tests
      console.log(`${colors.red}Failed Tests:${colors.reset}`);
      Object.entries(this.phases).forEach(([phase, results]) => {
        const failed = results.tests.filter(t => !t.passed);
        if (failed.length > 0) {
          console.log(`\n${colors.yellow}${phase.toUpperCase()}:${colors.reset}`);
          failed.forEach(test => {
            console.log(`  - ${test.testName}: ${test.message}`);
          });
        }
      });
    }
  }
}

// Run comprehensive test
const tester = new ComprehensiveIntegrationTest();
tester.runAllTests().catch(console.error);