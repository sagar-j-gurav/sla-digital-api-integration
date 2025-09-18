-- Initial database schema for SLA Digital Integration
-- PostgreSQL database setup

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: operators
CREATE TABLE IF NOT EXISTS operators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operator_code VARCHAR(50) UNIQUE NOT NULL,
  operator_name VARCHAR(100) NOT NULL,
  country VARCHAR(2) NOT NULL,
  flow_type VARCHAR(50) NOT NULL,
  enabled BOOLEAN DEFAULT false,
  configuration JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_webhook_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes
CREATE INDEX idx_operators_code ON operators(operator_code);
CREATE INDEX idx_operators_enabled ON operators(enabled);

-- Table: transactions
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id VARCHAR(100) UNIQUE NOT NULL,
  operator_code VARCHAR(50) NOT NULL,
  merchant_id VARCHAR(100),
  msisdn VARCHAR(50),
  campaign_id VARCHAR(100),
  service_id VARCHAR(100),
  amount DECIMAL(10, 2),
  currency VARCHAR(3),
  status VARCHAR(50) NOT NULL,
  flow_type VARCHAR(50),
  request_payload JSONB,
  response_payload JSONB,
  webhook_response JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_transactions_transaction_id ON transactions(transaction_id);
CREATE INDEX idx_transactions_operator ON transactions(operator_code);
CREATE INDEX idx_transactions_msisdn ON transactions(msisdn);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created ON transactions(created_at);

-- Table: subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id VARCHAR(100) UNIQUE NOT NULL,
  operator_code VARCHAR(50) NOT NULL,
  merchant_id VARCHAR(100),
  msisdn VARCHAR(50),
  campaign_id VARCHAR(100),
  service_id VARCHAR(100),
  status VARCHAR(50) NOT NULL,
  billing_frequency VARCHAR(20),
  amount DECIMAL(10, 2),
  currency VARCHAR(3),
  next_billing_date DATE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_subscriptions_subscription_id ON subscriptions(subscription_id);
CREATE INDEX idx_subscriptions_msisdn ON subscriptions(msisdn);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- Table: webhook_events
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id VARCHAR(100) UNIQUE,
  operator VARCHAR(50),
  event_type VARCHAR(100),
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  processing_attempts INTEGER DEFAULT 0,
  error_message TEXT,
  received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_webhook_events_event_id ON webhook_events(event_id);
CREATE INDEX idx_webhook_events_operator ON webhook_events(operator);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed);

-- Table: operation_audit
CREATE TABLE IF NOT EXISTS operation_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operation_type VARCHAR(100) NOT NULL,
  operator_code VARCHAR(50),
  user_id VARCHAR(100),
  ip_address INET,
  request_method VARCHAR(10),
  request_path VARCHAR(500),
  request_payload JSONB,
  response_status INTEGER,
  response_payload JSONB,
  duration_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_operation ON operation_audit(operation_type);
CREATE INDEX idx_audit_operator ON operation_audit(operator_code);
CREATE INDEX idx_audit_created ON operation_audit(created_at);

-- Update trigger for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
CREATE TRIGGER update_operators_updated_at BEFORE UPDATE ON operators
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert Zain Bahrain operator
INSERT INTO operators (operator_code, operator_name, country, flow_type, enabled) VALUES
  ('zain-bh', 'Zain Bahrain', 'BH', 'pin_api_allowed', true)
ON CONFLICT (operator_code) DO NOTHING;