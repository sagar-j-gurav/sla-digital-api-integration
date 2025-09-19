/**
 * SMS Service Tests
 * Test suite for SMS functionality
 */

const assert = require('assert');
const sinon = require('sinon');
const SMSService = require('../src/services/sms.service');

describe('SMS Service Tests', function() {
  let smsService;
  let mockSlaIntegration;
  let sandbox;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    
    // Mock SLA Integration
    mockSlaIntegration = {
      sendSMS: sandbox.stub()
    };
    
    smsService = new SMSService(mockSlaIntegration);
  });

  afterEach(function() {
    sandbox.restore();
  });

  describe('sendSMS', function() {
    it('should send SMS successfully', async function() {
      // Setup
      mockSlaIntegration.sendSMS.resolves({ success: true, data: {} });
      
      const params = {
        msisdn: '97312345678',
        message: 'Test message'
      };

      // Execute
      const result = await smsService.sendSMS('zain-bh', params);

      // Verify
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.message, 'SMS sent successfully');
      assert(result.correlator);
      assert(mockSlaIntegration.sendSMS.calledOnce);
    });

    it('should validate required parameters', async function() {
      // Test missing msisdn
      try {
        await smsService.sendSMS('zain-bh', { message: 'Test' });
        assert.fail('Should have thrown error');
      } catch (error) {
        assert(error.message.includes('required parameters'));
      }

      // Test missing message
      try {
        await smsService.sendSMS('zain-bh', { msisdn: '97312345678' });
        assert.fail('Should have thrown error');
      } catch (error) {
        assert(error.message.includes('required parameters'));
      }
    });

    it('should handle SMS failure gracefully', async function() {
      // Setup
      mockSlaIntegration.sendSMS.resolves({ success: false, error: { message: 'Failed' } });
      
      const params = {
        msisdn: '97312345678',
        message: 'Test message'
      };

      // Execute
      const result = await smsService.sendSMS('zain-bh', params);

      // Verify
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.message, 'SMS failed');
    });
  });

  describe('sendWelcomeSMS', function() {
    it('should format welcome message correctly', async function() {
      // Setup
      mockSlaIntegration.sendSMS.resolves({ success: true });
      
      const params = {
        msisdn: '97312345678',
        serviceName: 'MyService',
        accessUrl: 'https://example.com/access'
      };

      // Execute
      const result = await smsService.sendWelcomeSMS('zain-bh', params);

      // Verify
      assert.strictEqual(result.success, true);
      assert(result.messageContent.includes('To access your subscription to MyService'));
      assert(result.messageContent.includes('https://example.com/access'));
      
      // Check SLA was called with formatted message
      const slaCall = mockSlaIntegration.sendSMS.getCall(0);
      assert(slaCall.args[1].text.includes('MyService'));
    });

    it('should support Arabic language', async function() {
      // Setup
      mockSlaIntegration.sendSMS.resolves({ success: true });
      
      const params = {
        msisdn: '97312345678',
        serviceName: 'خدمتي',
        accessUrl: 'https://example.com/access',
        language: 'ar'
      };

      // Execute
      const result = await smsService.sendWelcomeSMS('zain-bh', params);

      // Verify
      assert(result.messageContent.includes('للوصول إلى اشتراكك'));
    });

    it('should validate required parameters', async function() {
      // Test missing parameters
      const testCases = [
        { serviceName: 'Test', accessUrl: 'http://test.com' }, // Missing msisdn
        { msisdn: '97312345678', accessUrl: 'http://test.com' }, // Missing serviceName
        { msisdn: '97312345678', serviceName: 'Test' } // Missing accessUrl
      ];

      for (const params of testCases) {
        try {
          await smsService.sendWelcomeSMS('zain-bh', params);
          assert.fail('Should have thrown error');
        } catch (error) {
          assert(error.message.includes('required parameters'));
        }
      }
    });

    it('should handle dynamic SMS for Mobily', async function() {
      // Setup
      mockSlaIntegration.sendSMS.resolves({ success: true });
      
      const params = {
        msisdn: '966501234567',
        serviceName: 'MyService',
        accessUrl: 'https://example.com/access',
        dynamicUrl: true
      };

      // Execute
      await smsService.sendWelcomeSMS('mobily-sa', params);

      // Verify
      const slaCall = mockSlaIntegration.sendSMS.getCall(0);
      assert.strictEqual(slaCall.args[1].text, 'https://example.com/access');
      assert.strictEqual(slaCall.args[1].dynamic_sms, true);
    });
  });

  describe('sendBatchSMS', function() {
    it('should send to multiple recipients', async function() {
      // Setup
      mockSlaIntegration.sendSMS.resolves({ success: true });
      
      const params = {
        recipients: ['97312345678', '97312345679', '97312345680'],
        message: 'Batch message'
      };

      // Execute
      const result = await smsService.sendBatchSMS('zain-bh', params);

      // Verify
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.total, 3);
      assert.strictEqual(result.successful, 3);
      assert.strictEqual(result.failed, 0);
      assert(result.batchId);
      assert.strictEqual(mockSlaIntegration.sendSMS.callCount, 3);
    });

    it('should handle partial failures', async function() {
      // Setup - alternate success/failure
      let callCount = 0;
      mockSlaIntegration.sendSMS.callsFake(() => {
        callCount++;
        return Promise.resolve({ 
          success: callCount % 2 === 1,
          error: callCount % 2 === 0 ? { message: 'Failed' } : null
        });
      });
      
      const params = {
        recipients: ['97312345678', '97312345679', '97312345680', '97312345681'],
        message: 'Batch message'
      };

      // Execute
      const result = await smsService.sendBatchSMS('zain-bh', params);

      // Verify
      assert.strictEqual(result.success, true); // At least one succeeded
      assert.strictEqual(result.total, 4);
      assert.strictEqual(result.successful, 2);
      assert.strictEqual(result.failed, 2);
    });

    it('should validate recipients array', async function() {
      // Test empty array
      try {
        await smsService.sendBatchSMS('zain-bh', { 
          recipients: [], 
          message: 'Test' 
        });
        assert.fail('Should have thrown error');
      } catch (error) {
        assert(error.message.includes('Recipients array'));
      }

      // Test missing recipients
      try {
        await smsService.sendBatchSMS('zain-bh', { 
          message: 'Test' 
        });
        assert.fail('Should have thrown error');
      } catch (error) {
        assert(error.message.includes('Recipients array'));
      }
    });
  });

  describe('validateMSISDN', function() {
    it('should validate Zain Bahrain numbers', function() {
      // Valid formats
      assert(smsService.validateMSISDN('97312345678', 'zain-bh'));
      assert(smsService.validateMSISDN('97333445566', 'zain-bh'));
      
      // Invalid formats
      assert(!smsService.validateMSISDN('12345678', 'zain-bh'));
      assert(!smsService.validateMSISDN('974123456789', 'zain-bh')); // Wrong country
      assert(!smsService.validateMSISDN('973123', 'zain-bh')); // Too short
    });

    it('should validate UK numbers', function() {
      assert(smsService.validateMSISDN('447700900000', 'vodafone-uk'));
      assert(!smsService.validateMSISDN('447700900', 'vodafone-uk')); // Too short
    });

    it('should validate Saudi numbers', function() {
      assert(smsService.validateMSISDN('966501234567', 'mobily-sa'));
      assert(!smsService.validateMSISDN('96650123', 'mobily-sa')); // Too short
    });

    it('should use default validation for unknown operators', function() {
      assert(smsService.validateMSISDN('1234567890123', 'unknown-op'));
      assert(!smsService.validateMSISDN('123', 'unknown-op')); // Too short
      assert(!smsService.validateMSISDN('12345abc', 'unknown-op')); // Contains letters
    });
  });

  describe('formatAccessUrl', function() {
    it('should add tracking parameters', function() {
      const url = smsService.formatAccessUrl('https://example.com/service', {
        operator: 'zain-bh',
        sub_id: '12345'
      });

      assert(url.includes('operator=zain-bh'));
      assert(url.includes('sub_id=12345'));
      assert(url.includes('utm_source=sms'));
      assert(url.includes('utm_medium=welcome'));
    });

    it('should preserve existing parameters', function() {
      const url = smsService.formatAccessUrl('https://example.com/service?existing=param', {
        new: 'value'
      });

      assert(url.includes('existing=param'));
      assert(url.includes('new=value'));
    });

    it('should not duplicate UTM parameters', function() {
      const url = smsService.formatAccessUrl('https://example.com/service?utm_source=email', {});
      
      // Should not add duplicate utm_source
      const matches = url.match(/utm_source/g);
      assert.strictEqual(matches.length, 1);
    });
  });

  describe('generateCorrelator', function() {
    it('should generate unique correlators', function() {
      const correlator1 = smsService.generateCorrelator();
      const correlator2 = smsService.generateCorrelator();
      
      assert(correlator1.startsWith('SMS_'));
      assert(correlator2.startsWith('SMS_'));
      assert.notStrictEqual(correlator1, correlator2);
    });
  });

  describe('generateBatchId', function() {
    it('should generate unique batch IDs', function() {
      const batchId1 = smsService.generateBatchId();
      const batchId2 = smsService.generateBatchId();
      
      assert(batchId1.startsWith('BATCH_'));
      assert(batchId2.startsWith('BATCH_'));
      assert.notStrictEqual(batchId1, batchId2);
    });
  });
});
