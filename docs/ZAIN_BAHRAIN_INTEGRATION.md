# Zain Bahrain API Integration - Quick Start Guide

## Implementation Complete ✅

The Zain Bahrain operator integration is now fully implemented with Express server, PostgreSQL database, and comprehensive API endpoints.

## Setup Instructions

### 1. Clone and Install

```bash
git clone https://github.com/sagar-j-gurav/sla-digital-api-integration.git
cd sla-digital-api-integration
npm install
```

### 2. PostgreSQL Setup

```bash
# Using Docker (Recommended)
docker run --name sla-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=sla_digital \
  -p 5432:5432 \
  -d postgres:14

# Or local PostgreSQL
createdb sla_digital
```

### 3. Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your credentials:
nano .env
```

**Required Zain Bahrain Variables:**

```env
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/sla_digital

# Zain Bahrain Credentials
OPERATOR_ALACRITY_USERNAME=your_username
OPERATOR_ALACRITY_PASSWORD=your_password
OPERATOR_ZAIN_BH_SERVICE_ID=campaign:your-service-id

# Sandbox Credentials
SANDBOX_API_USERNAME=your_sandbox_username
SANDBOX_API_PASSWORD=your_sandbox_password

# Merchant
MERCHANT_ID=partner:your-merchant-id

# Webhook Secret (generate random 32+ chars)
WEBHOOK_SECRET=generate_random_32_char_string_here
```

### 4. Run Database Migrations

```bash
npm run migrate
```

### 5. Start the Server

```bash
# Development
npm run dev

# Production
npm start

# Server runs on http://localhost:3000
```

## Zain Bahrain API Endpoints

### 1️⃣ Generate PIN (OTP)

```bash
curl -X POST http://localhost:3000/api/zain-bh/pin \
  -H "Content-Type: application/json" \
  -d '{
    "msisdn": "97312345678",
    "campaign": "campaign:your-service-id",
    "merchant": "partner:your-merchant-id"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "PIN sent successfully",
  "data": {
    "success": true,
    "status": "PIN_SENT",
    "pinSent": true,
    "pinLength": 6,
    "validitySeconds": 120,
    "testPin": "000000"  // Only in sandbox
  }
}
```

### 2️⃣ Create Subscription

```bash
curl -X POST http://localhost:3000/api/zain-bh/subscription \
  -H "Content-Type: application/json" \
  -d '{
    "msisdn": "97312345678",
    "pin": "000000",
    "campaign": "campaign:your-service-id",
    "merchant": "partner:your-merchant-id"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Subscription created successfully",
  "data": {
    "success": true,
    "status": "CHARGED",
    "subscriptionId": "sub-123456",
    "transactionId": "txn-789012"
  }
}
```

### 3️⃣ One-off Charge

```bash
curl -X POST http://localhost:3000/api/zain-bh/charge \
  -H "Content-Type: application/json" \
  -d '{
    "msisdn": "97312345678",
    "amount": "1.00",
    "campaign": "campaign:your-service-id",
    "merchant": "partner:your-merchant-id"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Charge completed successfully",
  "data": {
    "success": true,
    "status": "CHARGED",
    "transactionId": "txn-123456",
    "amount": "1.00",
    "currency": "BHD"
  }
}
```

### 4️⃣ Cancel Subscription

```bash
curl -X DELETE http://localhost:3000/api/zain-bh/subscription \
  -H "Content-Type: application/json" \
  -d '{
    "msisdn": "97312345678",
    "service": "campaign:your-service-id",
    "merchant": "partner:your-merchant-id"
  }'
```

### 5️⃣ Get Checkout URL

```bash
curl -X GET "http://localhost:3000/api/zain-bh/checkout-url?msisdn=97312345678&campaign=campaign:your-service-id&price=1.00&language=en"
```

**Response:**
```json
{
  "success": true,
  "checkoutUrl": "https://msisdn.sla-alacrity.com/checkout?campaign=...",
  "operator": "zain-bh",
  "environment": "sandbox"
}
```

## Webhook Endpoints

### Main Webhook Endpoint

```bash
# Calculate signature
PAYLOAD='{"eventId":"evt-123","eventType":"subscription.created","status":"SUCCESS"}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "your_webhook_secret" | sed 's/^.* //')

# Send webhook
curl -X POST http://localhost:3000/hooks/alacrity \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

### Zain Bahrain Specific Webhook

```bash
curl -X POST http://localhost:3000/hooks/zain-bh \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt-123456",
    "eventType": "subscription.created",
    "operator": "zain-bh",
    "status": "SUCCESS",
    "msisdn": "97312345678",
    "subscription_id": "sub-123456",
    "transaction_id": "txn-123456"
  }'
```

## Internal Management APIs

### Test Credentials

```bash
curl -X POST http://localhost:3000/internal/test-credentials/zain-bh \
  -H "Content-Type: application/json"
```

### Get Recent Transactions

```bash
curl -X GET http://localhost:3000/internal/zain-bh/transactions?limit=10 \
  -H "Content-Type: application/json"
```

### Health Check

```bash
curl -X GET http://localhost:3000/health
```

## Testing

### Run All Tests

```bash
# Make test script executable
chmod +x tests/test-zain-bahrain.sh

# Run tests
./tests/test-zain-bahrain.sh
```

### Test Individual Operations

```bash
# Test PIN generation only
npm run test:zain
```

## Database Schema

The following tables are created for Zain Bahrain operations:

- **operators** - Operator configurations
- **transactions** - Transaction records
- **subscriptions** - Active subscriptions
- **webhook_events** - Webhook event log
- **operation_audit** - API operation audit trail

### Check Database

```sql
-- Connect to database
psql -U postgres -d sla_digital

-- Check recent transactions
SELECT * FROM transactions 
WHERE operator_code = 'zain-bh' 
ORDER BY created_at DESC 
LIMIT 5;

-- Check subscriptions
SELECT * FROM subscriptions 
WHERE operator_code = 'zain-bh';

-- Check webhook events
SELECT * FROM webhook_events 
WHERE operator = 'zain-bh' 
ORDER BY received_at DESC;
```

## Environment-Specific URLs

### Sandbox (Testing)
- API Base: `https://msisdn.sla-alacrity.com/api/alacrity/v2.2`
- Checkout: `https://msisdn.sla-alacrity.com/checkout`
- Test PIN: Always `000000`

### Production
- API Base: `https://msisdn.sla-alacrity.com/api/alacrity/v2.2`
- Checkout: `https://msisdn.sla-alacrity.com/checkout`
- Real PINs sent via SMS

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
```bash
# Check PostgreSQL is running
docker ps | grep postgres
# Or
sudo systemctl status postgresql
```

2. **Invalid Credentials**
- Verify `OPERATOR_ALACRITY_USERNAME` and `OPERATOR_ALACRITY_PASSWORD` in `.env`
- Check if IP is whitelisted with SLA Digital

3. **PIN Not Working**
- In sandbox, always use `000000`
- In production, PIN expires after 120 seconds
- Generate new PIN if expired

4. **Webhook Signature Failed**
- Ensure `WEBHOOK_SECRET` matches between sender and receiver
- Use exact payload string for signature calculation

## Monitoring

### View Logs

```bash
# Application logs
tail -f logs/sla-digital.log

# Server console
npm run dev
```

### Database Monitoring

```bash
# Connect to PostgreSQL
psql -U postgres -d sla_digital

# Monitor in real-time
watch -n 1 'psql -U postgres -d sla_digital -c "SELECT * FROM transactions ORDER BY created_at DESC LIMIT 5"'
```

## Security Checklist

- ✅ Never commit `.env` with real credentials
- ✅ Use strong `WEBHOOK_SECRET` (32+ characters)
- ✅ Enable IP whitelist in production
- ✅ Use HTTPS in production
- ✅ Rotate credentials regularly
- ✅ Monitor failed authentication attempts

## Support

- **Repository**: https://github.com/sagar-j-gurav/sla-digital-api-integration
- **SLA Digital Docs**: https://docs.sla-alacrity.com/
- **Zain Bahrain Specifics**: PIN-based flow, 6-digit PINs, BHD currency

## Next Steps

1. **Test in Sandbox**: Use provided curl commands
2. **Get Production Credentials**: Contact SLA Digital
3. **Configure IP Whitelist**: Add your production IPs
4. **Deploy to Staging**: Test with real Zain Bahrain numbers
5. **Go Live**: Switch to production environment

---

*Implementation completed on September 18, 2025*
*Version: 2.0.0*