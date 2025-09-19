/**
 * SMS Service Module
 * Handles all SMS-related operations including welcome messages
 */

const { systemLogger, operatorLogger } = require('../utils/logger');
const crypto = require('crypto');

class SMSService {
  constructor(slaIntegration) {
    this.slaIntegration = slaIntegration;
    this.welcomeMessageTemplates = {
      'en': 'To access your subscription to {service_name}, click {url}',
      'ar': 'للوصول إلى اشتراكك في {service_name}، انقر على {url}'
    };
  }

  /**
   * Send generic SMS
   * @param {string} operator - Operator code (e.g., 'zain-bh')
   * @param {Object} params - SMS parameters
   * @returns {Object} SMS response
   */
  async sendSMS(operator, params) {
    operatorLogger.logOperation(operator, 'sendSMS', { msisdn: params.msisdn });
    
    try {
      // Validate required parameters
      if (!params.msisdn || !params.message) {
        throw new Error('Missing required parameters: msisdn and message');
      }

      // Add operator-specific parameters
      const smsParams = {
        msisdn: params.msisdn,
        text: params.message,
        campaign: params.campaign || process.env[`OPERATOR_${operator.toUpperCase().replace('-', '_')}_SERVICE_ID`],
        merchant: params.merchant || process.env.MERCHANT_ID,
        correlator: this.generateCorrelator()
      };

      // Call SLA Digital SMS API
      const response = await this.slaIntegration.sendSMS(operator, smsParams);
      
      operatorLogger.logSuccess(operator, 'sendSMS', { 
        msisdn: params.msisdn,
        status: response.success ? 'sent' : 'failed' 
      });

      return {
        success: response.success || false,
        message: response.success ? 'SMS sent successfully' : 'SMS failed',
        data: response,
        correlator: smsParams.correlator
      };
    } catch (error) {
      operatorLogger.logFailure(operator, 'sendSMS', error);
      throw error;
    }
  }

  /**
   * Send Welcome SMS with formatted message
   * @param {string} operator - Operator code
   * @param {Object} params - Welcome SMS parameters
   * @returns {Object} SMS response
   */
  async sendWelcomeSMS(operator, params) {
    operatorLogger.logOperation(operator, 'sendWelcomeSMS', { 
      msisdn: params.msisdn,
      serviceName: params.serviceName 
    });
    
    try {
      // Validate required parameters
      if (!params.msisdn || !params.serviceName || !params.accessUrl) {
        throw new Error('Missing required parameters: msisdn, serviceName, and accessUrl');
      }

      // Get template based on language
      const language = params.language || 'en';
      let template = this.welcomeMessageTemplates[language] || this.welcomeMessageTemplates['en'];
      
      // Format welcome message
      const welcomeMessage = template
        .replace('{service_name}', params.serviceName)
        .replace('{url}', params.accessUrl);

      // Prepare SMS parameters
      const smsParams = {
        msisdn: params.msisdn,
        text: welcomeMessage,
        campaign: params.campaign || process.env[`OPERATOR_${operator.toUpperCase().replace('-', '_')}_SERVICE_ID`],
        merchant: params.merchant || process.env.MERCHANT_ID,
        correlator: this.generateCorrelator(),
        metadata: {
          type: 'welcome',
          serviceName: params.serviceName,
          subscriptionId: params.subscriptionId
        }
      };

      // Handle operator-specific requirements
      if (operator === 'mobily-sa' && params.dynamicUrl) {
        smsParams.text = params.accessUrl;
        smsParams.dynamic_sms = true;
      }

      // Send SMS via SLA Digital
      const response = await this.slaIntegration.sendSMS(operator, smsParams);
      
      // Log success
      if (response.success) {
        systemLogger.info('Welcome SMS sent', {
          operator,
          msisdn: params.msisdn,
          serviceName: params.serviceName,
          correlator: smsParams.correlator
        });
      } else {
        systemLogger.warn('Welcome SMS failed', {
          operator,
          msisdn: params.msisdn,
          error: response.error
        });
      }

      return {
        success: response.success || false,
        message: response.success ? 'Welcome SMS sent successfully' : 'Welcome SMS failed',
        data: response,
        correlator: smsParams.correlator,
        messageContent: welcomeMessage
      };
    } catch (error) {
      operatorLogger.logFailure(operator, 'sendWelcomeSMS', error);
      throw error;
    }
  }

  /**
   * Send batch SMS (for multiple recipients)
   * @param {string} operator - Operator code
   * @param {Object} params - Batch SMS parameters
   * @returns {Object} Batch results
   */
  async sendBatchSMS(operator, params) {
    operatorLogger.logOperation(operator, 'sendBatchSMS', { 
      recipients: params.recipients?.length || 0 
    });
    
    try {
      if (!params.recipients || !Array.isArray(params.recipients) || params.recipients.length === 0) {
        throw new Error('Recipients array is required and must not be empty');
      }

      if (!params.message) {
        throw new Error('Message is required for batch SMS');
      }

      const results = [];
      const batchId = this.generateBatchId();

      for (const msisdn of params.recipients) {
        try {
          const result = await this.sendSMS(operator, {
            msisdn,
            message: params.message,
            campaign: params.campaign,
            merchant: params.merchant
          });
          
          results.push({
            msisdn,
            success: result.success,
            correlator: result.correlator,
            error: result.success ? null : result.data?.error
          });
        } catch (error) {
          results.push({
            msisdn,
            success: false,
            error: error.message
          });
        }
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      return {
        success: successful > 0,
        batchId,
        total: params.recipients.length,
        successful,
        failed,
        results
      };
    } catch (error) {
      operatorLogger.logFailure(operator, 'sendBatchSMS', error);
      throw error;
    }
  }

  /**
   * Get SMS status by correlator
   * @param {string} operator - Operator code
   * @param {string} correlator - Correlator ID
   * @returns {Object} SMS status
   */
  async getSMSStatus(operator, correlator) {
    // This would typically query the database or call an API
    // For now, returning a mock response
    return {
      success: true,
      correlator,
      status: 'delivered',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generate correlator for SMS tracking
   * @returns {string} Correlator ID
   */
  generateCorrelator() {
    return `SMS_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Generate batch ID for batch SMS
   * @returns {string} Batch ID
   */
  generateBatchId() {
    return `BATCH_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Validate MSISDN format by operator
   * @param {string} msisdn - Mobile number
   * @param {string} operator - Operator code
   * @returns {boolean} Is valid
   */
  validateMSISDN(msisdn, operator) {
    const patterns = {
      'zain-bh': /^973\d{8}$/,
      'vodafone-uk': /^44\d{10}$/,
      'telenor-mm': /^959\d{7,9}$/,
      'mobily-sa': /^966\d{9}$/
    };

    const pattern = patterns[operator];
    if (!pattern) {
      // Default validation - must be digits only
      return /^\d{10,15}$/.test(msisdn);
    }

    return pattern.test(msisdn);
  }

  /**
   * Format access URL with tracking parameters
   * @param {string} baseUrl - Base URL
   * @param {Object} params - URL parameters
   * @returns {string} Formatted URL
   */
  formatAccessUrl(baseUrl, params = {}) {
    const url = new URL(baseUrl);
    
    // Add tracking parameters
    Object.keys(params).forEach(key => {
      url.searchParams.append(key, params[key]);
    });

    // Add UTM parameters if not present
    if (!url.searchParams.has('utm_source')) {
      url.searchParams.append('utm_source', 'sms');
    }
    if (!url.searchParams.has('utm_medium')) {
      url.searchParams.append('utm_medium', 'welcome');
    }

    return url.toString();
  }
}

module.exports = SMSService;
