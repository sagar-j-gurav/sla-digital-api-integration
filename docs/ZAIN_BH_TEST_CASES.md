# Zain Bahrain API Test Cases

## Test Environment Setup
```bash
# Copy environment file
cp .env.example .env

# Set required variables
OPERATOR_ZAIN_BH_SERVICE_ID=campaign:your-service-id
MERCHANT_ID=partner:your-merchant-id
SANDBOX_API_USERNAME=your_username
SANDBOX_API_PASSWORD=your_password
```

## 1. Checkout Flow Tests

### Test 1.1: Get Checkout URL (✅ FIXED)
**Purpose**: Verify checkout URL generation with correct parameters

```bash
# Test with all parameters
curl -X GET "http://localhost:3000/api/zain-bh/checkout-url?redirect_url=https://example.com/callback&merchant=partner:test&campaign=campaign:test&locale=en&correlator=TEST123&price=1.5"

# Expected Response:
{
  "success": true,
  "checkoutUrl": "http://msisdn-sandbox.sla-alacrity.com/purchase?merchant=partner:test&service=campaign:test&redirect_url=https%3A%2F%2Fexample.com%2Fcallback&correlator=TEST123&price=1.5&locale=en",
  "operator": "zain-bh",
  "environment": "sandbox",
  "checkoutBase": "http://msisdn-sandbox.sla-alacrity.com/purchase",
  "parameters": {
    "merchant": "partner:test",
    "service": "campaign:test",
    "redirect_url": "https://example.com/callback",
    "locale": "en",
    "correlator": "TEST123",
    "price": "1.5"
  }
}
```

### Test 1.2: Missing redirect_url (Error Test)
```bash
curl -X GET "http://localhost:3000/api/zain-bh/checkout-url?campaign=campaign:test"

# Expected Response (400 Bad Request):
{
  "success": false,
  "error": "Missing required parameter: redirect_url"
}
```

## 2. Token-Based Subscription Tests

### Test 2.1: Create Subscription with TOKEN (✅ FIXED)
**Purpose**: Verify subscription creation using checkout token

```bash
curl -X POST http://localhost:3000/api/zain-bh/subscription \
  -H "Content-Type: application/json" \
  -d '{
    "msisdn": "TOKEN:1c86724f-b09b-4bed-be8f-4683se8efs34",
    "campaign": "campaign:940d351138df895e8dedf51e5d7b90788cdc23d0",
    "merchant": "partner:4e3f654ed86dbb113bb472be07630b3cb6ad0859",
    "language": "en"
  }'

# Expected Response:
{
  "success": true,
  "message": "Subscription created successfully",
  "data": {
    "success": true,
    "uuid": "c537bf6a-xxxx-xxxx-9eaa-bf6d3faed28c",
    "msisdn": "97312345678"
  },
  "flowType": "checkout_token"
}
```

### Test 2.2: Create Subscription with PIN
```bash
curl -X POST http://localhost:3000/api/zain-bh/subscription \
  -H "Content-Type: application/json" \
  -d '{
    "msisdn": "97312345678",
    "pin": "12345",
    "campaign": "campaign:test",
    "merchant": "partner:test"
  }'

# Expected Response:
{
  "success": true,
  "message": "Subscription created successfully",
  "data": {...},
  "flowType": "pin_api"
}
```

### Test 2.3: Missing PIN for non-token subscription
```bash
curl -X POST http://localhost:3000/api/zain-bh/subscription \
  -H "Content-Type: application/json" \
  -d '{
    "msisdn": "97312345678",
    "campaign": "campaign:test"
  }'

# Expected Response (400):
{
  "error": "Missing required parameter: pin (not needed if using token from checkout)"
}
```

## 3. Token-Based Charge Tests

### Test 3.1: One-off Charge with TOKEN (✅ FIXED)
```bash
curl -X POST http://localhost:3000/api/zain-bh/charge \
  -H "Content-Type: application/json" \
  -d '{
    "msisdn": "TOKEN:1c86724f-b09b-4bed-be8f-4683se8efs34",
    "amount": "0.5",
    "currency": "BHD",
    "campaign": "campaign:test",
    "merchant": "partner:test"
  }'
```

## 4. Delete Subscription Tests

### Test 4.1: Delete with TOKEN (✅ FIXED)
```bash
curl -X DELETE http://localhost:3000/api/zain-bh/subscription \
  -H "Content-Type: application/json" \
  -d '{
    "msisdn": "TOKEN:1c86724f-b09b-4bed-be8f-4683se8efs34",
    "campaign": "campaign:test",
    "merchant": "partner:test"
  }'
```

### Test 4.2: Delete with MSISDN
```bash
curl -X DELETE http://localhost:3000/api/zain-bh/subscription \
  -H "Content-Type: application/json" \
  -d '{
    "msisdn": "97312345678",
    "campaign": "campaign:test",
    "merchant": "partner:test"
  }'
```

## 5. Complete Flow Integration Test

### Step 1: Generate Checkout URL
```bash
REDIRECT_URL="https://myservice.com/callback"
CHECKOUT_RESPONSE=$(curl -s -X GET "http://localhost:3000/api/zain-bh/checkout-url?redirect_url=${REDIRECT_URL}&locale=ar")
echo $CHECKOUT_RESPONSE | jq -r '.checkoutUrl'
```

### Step 2: Simulate Checkout Callback
After user completes checkout, you receive:
```
https://myservice.com/callback?status=success&token=TOKEN:1c86724f-b09b-4bed-be8f-4683se8efs34&auth_method=sms_pin&correlator=TEST123
```

### Step 3: Create Subscription with Token
```bash
TOKEN="TOKEN:1c86724f-b09b-4bed-be8f-4683se8efs34"
curl -X POST http://localhost:3000/api/zain-bh/subscription \
  -H "Content-Type: application/json" \
  -d "{
    \"msisdn\": \"${TOKEN}\",
    \"campaign\": \"campaign:test\",
    \"merchant\": \"partner:test\"
  }"
```

### Step 4: Send Welcome SMS
```bash
curl -X POST http://localhost:3000/api/zain-bh/welcome-sms \
  -H "Content-Type: application/json" \
  -d '{
    "msisdn": "97312345678",
    "serviceName": "Premium Content",
    "accessUrl": "https://myservice.com/access",
    "subscriptionId": "SUB123456"
  }'
```

## 6. PIN Flow Integration Test

### Step 1: Generate PIN
```bash
curl -X POST http://localhost:3000/api/zain-bh/pin \
  -H "Content-Type: application/json" \
  -d '{
    "msisdn": "97312345678",
    "campaign": "campaign:test",
    "merchant": "partner:test"
  }'
```

### Step 2: Create Subscription with PIN
```bash
# In sandbox, PIN is always 000000
curl -X POST http://localhost:3000/api/zain-bh/subscription \
  -H "Content-Type: application/json" \
  -d '{
    "msisdn": "97312345678",
    "pin": "000000",
    "campaign": "campaign:test",
    "merchant": "partner:test"
  }'
```

### Step 3: Send Welcome SMS
```bash
curl -X POST http://localhost:3000/api/zain-bh/welcome-sms \
  -H "Content-Type: application/json" \
  -d '{
    "msisdn": "97312345678",
    "serviceName": "Premium Content",
    "accessUrl": "https://myservice.com/access"
  }'
```

## Test Validation Checklist

### ✅ Fixed Issues:
- [x] `redirect_url` is now required in checkout endpoint
- [x] `locale` parameter used instead of `language`
- [x] `correlator` is accepted as optional parameter
- [x] TOKEN-based subscription works without PIN
- [x] TOKEN-based charge works without PIN
- [x] Delete subscription works with TOKEN
- [x] Proper validation messages for missing parameters

### Parameter Validation:
- [x] Checkout URL contains `redirect_url` in query string
- [x] Checkout URL uses `service` not `campaign` parameter
- [x] Checkout URL uses `locale` not `language`
- [x] Subscription accepts TOKEN: prefix in msisdn
- [x] Charge accepts TOKEN: prefix in msisdn
- [x] Delete accepts TOKEN: prefix in msisdn

## Production Considerations

1. **Environment Variables**: Ensure production credentials are set
2. **IP Whitelisting**: Add SLA Digital IPs to `WHITELISTED_IPS`
3. **Webhook Secret**: Set `WEBHOOK_SECRET` for signature validation
4. **Database**: Ensure PostgreSQL is configured and migrations run
5. **Monitoring**: Set up logging and error tracking
6. **Rate Limiting**: Adjust `RATE_LIMIT_MAX_REQUESTS` as needed

## Common Error Scenarios

### Error 1: Invalid Token
```json
{
  "error": {
    "category": "Request Validation",
    "code": "2012",
    "message": "Token expired or invalid"
  }
}
```

### Error 2: Duplicate Subscription
```json
{
  "error": {
    "category": "Subscription",
    "code": "3001",
    "message": "Subscription already exists"
  }
}
```

### Error 3: Invalid PIN
```json
{
  "error": {
    "category": "Authentication",
    "code": "1002",
    "message": "Invalid PIN"
  }
}
```

## Notes

- Tokens are valid for 120 seconds after checkout
- In sandbox, PIN is always `000000`
- Use the same TOKEN for delete that was used for subscription
- Welcome SMS is required after subscription per SLA guidelines
- Zain Bahrain uses `http://msisdn.sla-alacrity.com` for checkout
