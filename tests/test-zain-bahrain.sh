#!/bin/bash

# =======================================================
# Zain Bahrain API Testing with CURL Examples
# =======================================================
# 
# Before running these tests:
# 1. Start the server: npm start
# 2. Update .env with your actual credentials
# 3. PostgreSQL should be running
# 4. Run migrations: npm run migrate
#
# Note: In sandbox environment, PIN is always 000000
# =======================================================

# Configuration
API_BASE_URL="http://localhost:3000"
TEST_MSISDN="97312345678"  # Test Bahraini number
WEBHOOK_SECRET="your_webhook_secret_here_minimum_32_characters"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Zain Bahrain API Testing${NC}"
echo -e "${GREEN}========================================${NC}"

# =======================================================
# 1. HEALTH CHECK
# =======================================================
echo -e "\n${YELLOW}1. Testing Health Check...${NC}"

curl -X GET "$API_BASE_URL/health" \
  -H "Content-Type: application/json" | jq .

echo -e "${GREEN}✓ Health check complete${NC}"

# =======================================================
# 2. TEST CREDENTIALS
# =======================================================
echo -e "\n${YELLOW}2. Testing Zain Bahrain Credentials...${NC}"

curl -X POST "$API_BASE_URL/internal/test-credentials/zain-bh" \
  -H "Content-Type: application/json" | jq .

echo -e "${GREEN}✓ Credential test complete${NC}"

# =======================================================
# 3. GENERATE PIN (OTP)
# =======================================================
echo -e "\n${YELLOW}3. Generating PIN for Zain Bahrain...${NC}"

curl -X POST "$API_BASE_URL/api/zain-bh/pin" \
  -H "Content-Type: application/json" \
  -d '{
    "msisdn": "'$TEST_MSISDN'",
    "campaign": "campaign:test-service",
    "merchant": "partner:test-merchant"
  }' | jq .

echo -e "${GREEN}✓ PIN generation request sent${NC}"
echo -e "${YELLOW}Note: In sandbox, PIN is always 000000${NC}"

# =======================================================
# 4. CREATE SUBSCRIPTION
# =======================================================
echo -e "\n${YELLOW}4. Creating Subscription with PIN...${NC}"

curl -X POST "$API_BASE_URL/api/zain-bh/subscription" \
  -H "Content-Type: application/json" \
  -d '{
    "msisdn": "'$TEST_MSISDN'",
    "pin": "000000",
    "campaign": "campaign:test-service",
    "merchant": "partner:test-merchant"
  }' | jq .

echo -e "${GREEN}✓ Subscription creation request sent${NC}"

# =======================================================
# 5. ONE-OFF CHARGE
# =======================================================
echo -e "\n${YELLOW}5. Processing One-off Charge...${NC}"

curl -X POST "$API_BASE_URL/api/zain-bh/charge" \
  -H "Content-Type: application/json" \
  -d '{
    "msisdn": "'$TEST_MSISDN'",
    "amount": "1.00",
    "campaign": "campaign:test-service",
    "merchant": "partner:test-merchant"
  }' | jq .

echo -e "${GREEN}✓ Charge request sent${NC}"

# =======================================================
# 6. GET CHECKOUT URL
# =======================================================
echo -e "\n${YELLOW}6. Getting Checkout URL...${NC}"

curl -X GET "$API_BASE_URL/api/zain-bh/checkout-url?msisdn=$TEST_MSISDN&campaign=campaign:test-service&price=1.00&language=en" \
  -H "Content-Type: application/json" | jq .

echo -e "${GREEN}✓ Checkout URL retrieved${NC}"

# =======================================================
# 7. DELETE SUBSCRIPTION
# =======================================================
echo -e "\n${YELLOW}7. Deleting Subscription...${NC}"

curl -X DELETE "$API_BASE_URL/api/zain-bh/subscription" \
  -H "Content-Type: application/json" \
  -d '{
    "msisdn": "'$TEST_MSISDN'",
    "service": "campaign:test-service",
    "merchant": "partner:test-merchant"
  }' | jq .

echo -e "${GREEN}✓ Subscription deletion request sent${NC}"

# =======================================================
# 8. SIMULATE WEBHOOK
# =======================================================
echo -e "\n${YELLOW}8. Simulating Zain Bahrain Webhook...${NC}"

# Generate webhook payload
PAYLOAD='{
  "eventId": "evt-123456",
  "eventType": "subscription.created",
  "operator": "zain-bh",
  "status": "SUCCESS",
  "msisdn": "'$TEST_MSISDN'",
  "subscription_id": "sub-123456",
  "transaction_id": "txn-123456",
  "timestamp": "'$(date -Iseconds)'"
}'

# Calculate signature (requires openssl)
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | sed 's/^.* //')

echo "Webhook Payload:"
echo "$PAYLOAD" | jq .

curl -X POST "$API_BASE_URL/hooks/zain-bh" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $SIGNATURE" \
  -d "$PAYLOAD" | jq .

echo -e "${GREEN}✓ Webhook simulation complete${NC}"

# =======================================================
# 9. GET RECENT TRANSACTIONS
# =======================================================
echo -e "\n${YELLOW}9. Getting Recent Zain Bahrain Transactions...${NC}"

curl -X GET "$API_BASE_URL/internal/zain-bh/transactions?limit=5" \
  -H "Content-Type: application/json" | jq .

echo -e "${GREEN}✓ Transaction history retrieved${NC}"

# =======================================================
# SUMMARY
# =======================================================
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Testing Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "\n${YELLOW}Additional Test Commands:${NC}"
echo ""
echo "# Test with custom MSISDN:"
echo "curl -X POST $API_BASE_URL/api/zain-bh/pin \\"
echo '  -H "Content-Type: application/json" \'
echo '  -d '"'"'{"msisdn": "97312345678", "campaign": "your-campaign-id"}'"'"''
echo ""
echo "# Test webhook signature validation:"
echo "curl -X POST $API_BASE_URL/hooks/alacrity \\"
echo '  -H "Content-Type: application/json" \'
echo '  -H "X-Webhook-Signature: invalid-signature" \'
echo '  -d '"'"'{"test": "data"}'"'"''
echo ""
echo "# Monitor server logs:"
echo "tail -f logs/sla-digital.log"
echo ""
echo "# Check database directly:"
echo 'psql -U postgres -d sla_digital -c "SELECT * FROM transactions ORDER BY created_at DESC LIMIT 5;"'
echo ""
echo -e "${GREEN}========================================${NC}"