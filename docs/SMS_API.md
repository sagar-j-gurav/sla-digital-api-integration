# SMS API Documentation

## Overview
This document describes the SMS endpoints available in the SLA Digital API Integration for sending SMS messages through various operators, with a focus on Zain Bahrain.

## Endpoints

### 1. Send Generic SMS
**Endpoint:** `POST /api/zain-bh/sms`

Send a generic SMS message to a subscriber.

#### Request Body
```json
{
  "msisdn": "97312345678",
  "message": "Your custom message here",
  "campaign": "optional_campaign_id",
  "merchant": "optional_merchant_id"
}
```

#### Response
```json
{
  "success": true,
  "message": "SMS sent successfully",
  "data": {
    "success": true,
    "transaction": {
      "status": "SENT"
    }
  },
  "correlator": "SMS_1234567890_abcdef123456"
}
```

#### Example cURL
```bash
curl -X POST http://localhost:3000/api/zain-bh/sms \
  -H "Content-Type: application/json" \
  -d '{
    "msisdn": "97312345678",
    "message": "Thank you for subscribing to our service!"
  }'
```

---

### 2. Send Welcome SMS
**Endpoint:** `POST /api/zain-bh/welcome-sms`

Send a formatted welcome SMS with the standard format required by SLA Digital.

#### Request Body
```json
{
  "msisdn": "97312345678",
  "serviceName": "Premium Content Service",
  "accessUrl": "https://myservice.com/access",
  "subscriptionId": "SUB123456",
  "language": "en",
  "campaign": "optional_campaign_id",
  "merchant": "optional_merchant_id"
}
```

#### Response
```json
{
  "success": true,
  "message": "Welcome SMS sent successfully",
  "data": {
    "success": true,
    "transaction": {
      "status": "SENT"
    }
  },
  "correlator": "SMS_1234567890_abcdef123456",
  "messageContent": "To access your subscription to Premium Content Service, click https://myservice.com/access?operator=zain-bh&sub_id=SUB123456&source=welcome_sms&timestamp=1234567890&utm_source=sms&utm_medium=welcome"
}
```

#### Example cURL
```bash
curl -X POST http://localhost:3000/api/zain-bh/welcome-sms \
  -H "Content-Type: application/json" \
  -d '{
    "msisdn": "97312345678",
    "serviceName": "MyService",
    "accessUrl": "https://myservice.com/access",
    "subscriptionId": "SUB123456",
    "language": "en"
  }'
```

#### Language Support
- `en` - English (default)
- `ar` - Arabic

The welcome message format:
- **English:** "To access your subscription to {service_name}, click {url}"
- **Arabic:** "للوصول إلى اشتراكك في {service_name}، انقر على {url}"

---

### 3. Send Batch SMS
**Endpoint:** `POST /api/zain-bh/batch-sms`

Send the same message to multiple recipients.

#### Request Body
```json
{
  "recipients": ["97312345678", "97312345679", "97312345680"],
  "message": "Special offer for all our subscribers!",
  "campaign": "optional_campaign_id",
  "merchant": "optional_merchant_id"
}
```

#### Response
```json
{
  "success": true,
  "batchId": "BATCH_1234567890_abcdef123456",
  "total": 3,
  "successful": 3,
  "failed": 0,
  "results": [
    {
      "msisdn": "97312345678",
      "success": true,
      "correlator": "SMS_1234567890_abc123",
      "error": null
    },
    {
      "msisdn": "97312345679",
      "success": true,
      "correlator": "SMS_1234567891_def456",
      "error": null
    },
    {
      "msisdn": "97312345680",
      "success": true,
      "correlator": "SMS_1234567892_ghi789",
      "error": null
    }
  ]
}
```

#### Example cURL
```bash
curl -X POST http://localhost:3000/api/zain-bh/batch-sms \
  -H "Content-Type: application/json" \
  -d '{
    "recipients": ["97312345678", "97312345679"],
    "message": "Important service update for all users"
  }'
```

---

## MSISDN Format Requirements

Each operator has specific MSISDN format requirements:

| Operator | Country | Format | Example |
|----------|---------|--------|---------|
| Zain Bahrain | Bahrain | 973XXXXXXXX | 97312345678 |
| Vodafone UK | United Kingdom | 44XXXXXXXXXX | 447700900000 |
| Telenor Myanmar | Myanmar | 959XXXXXXXXX | 959123456789 |
| Mobily Saudi Arabia | Saudi Arabia | 966XXXXXXXXX | 966501234567 |

---

## Error Responses

### Validation Error
```json
{
  "errors": [
    {
      "msg": "MSISDN is required",
      "param": "msisdn",
      "location": "body"
    }
  ]
}
```

### Invalid MSISDN Format
```json
{
  "success": false,
  "error": "Invalid MSISDN format for Zain Bahrain. Expected format: 973XXXXXXXX"
}
```

### SMS Sending Failed
```json
{
  "success": false,
  "error": "SMS sending failed: [error details]"
}
```

---

## Configuration

### Environment Variables

Add the following to your `.env` file:

```env
# Operator Service IDs
OPERATOR_ZAIN_BH_SERVICE_ID=campaign:your-service-id

# Merchant Configuration
MERCHANT_ID=your-merchant-id

# SMS Configuration
SMS_MAX_LENGTH=160
SMS_BATCH_LIMIT=100

# Test Numbers (Sandbox only)
TEST_MSISDN_ZAIN_BH=97312345678
```

---

## Testing

### Unit Tests
Run the SMS service tests:
```bash
npm test tests/sms.service.test.js
```

### Integration Testing

1. **Test Generic SMS:**
```bash
# Send a test SMS
curl -X POST http://localhost:3000/api/zain-bh/sms \
  -H "Content-Type: application/json" \
  -d '{
    "msisdn": "97312345678",
    "message": "Test SMS from integration"
  }'
```

2. **Test Welcome SMS:**
```bash
# Send a welcome SMS with tracking
curl -X POST http://localhost:3000/api/zain-bh/welcome-sms \
  -H "Content-Type: application/json" \
  -d '{
    "msisdn": "97312345678",
    "serviceName": "Test Service",
    "accessUrl": "https://example.com/access",
    "subscriptionId": "TEST123"
  }'
```

3. **Test Batch SMS:**
```bash
# Send to multiple recipients
curl -X POST http://localhost:3000/api/zain-bh/batch-sms \
  -H "Content-Type: application/json" \
  -d '{
    "recipients": ["97312345678", "97312345679"],
    "message": "Batch test message"
  }'
```

---

## Database Schema

The SMS endpoints log all messages to the database:

### sms_logs Table
```sql
CREATE TABLE sms_logs (
  id SERIAL PRIMARY KEY,
  correlator VARCHAR(100) UNIQUE NOT NULL,
  operator_code VARCHAR(50) NOT NULL,
  msisdn VARCHAR(20) NOT NULL,
  message TEXT,
  message_type VARCHAR(20) DEFAULT 'generic',
  subscription_id VARCHAR(100),
  status VARCHAR(20) NOT NULL,
  sent_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### batch_sms_logs Table
```sql
CREATE TABLE batch_sms_logs (
  id SERIAL PRIMARY KEY,
  batch_id VARCHAR(100) UNIQUE NOT NULL,
  operator_code VARCHAR(50) NOT NULL,
  total_recipients INTEGER NOT NULL,
  successful INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Features

### Welcome SMS Features
- **Automatic URL formatting** with tracking parameters
- **Multi-language support** (English and Arabic)
- **UTM parameters** added automatically for analytics
- **Subscription ID tracking** for linking SMS to subscriptions
- **Operator-specific handling** (e.g., dynamic SMS for Mobily)

### Batch SMS Features
- **Parallel processing** for faster delivery
- **Individual tracking** with correlator per message
- **Partial failure handling** - continues even if some fail
- **Detailed results** showing success/failure per recipient
- **Batch ID** for tracking entire batch operation

### Security Features
- **IP Whitelisting** (configurable per environment)
- **Rate limiting** to prevent abuse
- **Input validation** using express-validator
- **MSISDN format validation** per operator
- **Database logging** for audit trail

---

## Best Practices

1. **Always validate MSISDN format** before sending SMS
2. **Use correlators** for tracking individual messages
3. **Implement retry logic** for failed messages
4. **Monitor SMS delivery rates** through logs
5. **Set appropriate rate limits** based on operator guidelines
6. **Use batch SMS** for bulk messaging to optimize performance
7. **Include unsubscribe information** in marketing messages
8. **Test with sandbox numbers** before production deployment

---

## Troubleshooting

### Common Issues

1. **"Invalid MSISDN format"**
   - Ensure the number includes the country code
   - Check the format matches the operator requirements
   - Remove any special characters or spaces

2. **"SMS sending failed"**
   - Check API credentials in environment variables
   - Verify the operator service is configured correctly
   - Check network connectivity to SLA Digital API
   - Review logs for detailed error messages

3. **"Campaign ID not found"**
   - Ensure OPERATOR_ZAIN_BH_SERVICE_ID is set in .env
   - Verify the campaign exists in SLA Digital portal
   - Check if using correct environment (sandbox/production)

4. **Rate limiting errors**
   - Implement exponential backoff for retries
   - Use batch SMS for bulk messages
   - Contact SLA Digital for rate limit increases

---

## Support

For additional support or questions:
- Check the [SLA Digital Documentation](https://docs.sla-alacrity.com/docs/send-sms-usage)
- Review the [main README](../README.md)
- Contact the development team

---

## Changelog

### v1.0.0 (2025-09-19)
- Initial implementation of SMS endpoints
- Added generic SMS endpoint
- Added welcome SMS endpoint with formatting
- Added batch SMS endpoint
- Implemented MSISDN validation
- Added comprehensive test suite
- Database logging integration
