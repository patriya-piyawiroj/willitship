-- Migration: Add name columns to bill_of_ladings table
-- This ensures carrier, seller, buyer name columns exist

ALTER TABLE bill_of_ladings
ADD COLUMN IF NOT EXISTS carrier VARCHAR(255),
ADD COLUMN IF NOT EXISTS seller VARCHAR(255),
ADD COLUMN IF NOT EXISTS buyer VARCHAR(255);

-- Add indexes for faster lookups on new name columns
CREATE INDEX IF NOT EXISTS idx_bill_of_ladings_carrier ON bill_of_ladings(carrier);
CREATE INDEX IF NOT EXISTS idx_bill_of_ladings_seller ON bill_of_ladings(seller);
CREATE INDEX IF NOT EXISTS idx_bill_of_ladings_buyer ON bill_of_ladings(buyer);
