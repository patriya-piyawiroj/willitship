-- Initial database setup for WillItShip
-- This will be run when the PostgreSQL container starts for the first time

-- Create the willitship database (if not exists)
-- Note: The database is already created via POSTGRES_DB env var

-- Create tables for bill_of_ladings and offers
-- These will be created automatically when the database starts

-- Table: bill_of_ladings
CREATE TABLE IF NOT EXISTS bill_of_ladings (
    id SERIAL PRIMARY KEY,
    bol_hash VARCHAR(66) NOT NULL UNIQUE,
    contract_address VARCHAR(42) NOT NULL,
    buyer_wallet VARCHAR(42) NOT NULL,
    seller_wallet VARCHAR(42) NOT NULL,
    declared_value VARCHAR(78) NOT NULL,
    bl_number VARCHAR(255),
    carrier VARCHAR(255),
    seller VARCHAR(255),
    buyer VARCHAR(255),
    place_of_receipt VARCHAR(255),
    place_of_delivery VARCHAR(255),
    pdf_url VARCHAR(500),
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    total_funded VARCHAR(78) NOT NULL DEFAULT '0',
    total_paid VARCHAR(78) NOT NULL DEFAULT '0',
    total_claimed VARCHAR(78) NOT NULL DEFAULT '0',
    settled BOOLEAN NOT NULL DEFAULT FALSE,
    minted_at TIMESTAMPTZ,
    funding_enabled_at TIMESTAMPTZ,
    arrived_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for bill_of_ladings
CREATE INDEX IF NOT EXISTS idx_bill_of_ladings_bol_hash ON bill_of_ladings(bol_hash);
CREATE INDEX IF NOT EXISTS idx_bill_of_ladings_contract_address ON bill_of_ladings(contract_address);
CREATE INDEX IF NOT EXISTS idx_bill_of_ladings_buyer_wallet ON bill_of_ladings(buyer_wallet);
CREATE INDEX IF NOT EXISTS idx_bill_of_ladings_seller_wallet ON bill_of_ladings(seller_wallet);
CREATE INDEX IF NOT EXISTS idx_bill_of_ladings_bl_number ON bill_of_ladings(bl_number);
CREATE INDEX IF NOT EXISTS idx_bill_of_ladings_carrier ON bill_of_ladings(carrier);
CREATE INDEX IF NOT EXISTS idx_bill_of_ladings_seller ON bill_of_ladings(seller);
CREATE INDEX IF NOT EXISTS idx_bill_of_ladings_buyer ON bill_of_ladings(buyer);

-- Table: offers
CREATE TABLE IF NOT EXISTS offers (
    id SERIAL PRIMARY KEY,
    bol_hash VARCHAR(66) NOT NULL,
    offer_id BIGINT NOT NULL,
    investor VARCHAR(42) NOT NULL,
    amount VARCHAR(78) NOT NULL,
    interest_rate_bps BIGINT NOT NULL,
    claim_tokens VARCHAR(78) NOT NULL,
    accepted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for offers
CREATE INDEX IF NOT EXISTS idx_offers_bol_hash ON offers(bol_hash);
CREATE INDEX IF NOT EXISTS idx_offers_investor ON offers(investor);
CREATE INDEX IF NOT EXISTS idx_offers_accepted ON offers(accepted);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for automatic updated_at updates
CREATE TRIGGER update_bill_of_ladings_updated_at
    BEFORE UPDATE ON bill_of_ladings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_offers_updated_at
    BEFORE UPDATE ON offers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
