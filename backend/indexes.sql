-- Performance optimization indexes for production
-- Run this after initial schema.sql

-- Outings table indexes
CREATE INDEX IF NOT EXISTS idx_outings_host_user_id ON outings(host_user_id);
CREATE INDEX IF NOT EXISTS idx_outings_created_at ON outings(created_at);
CREATE INDEX IF NOT EXISTS idx_outings_is_closed ON outings(is_closed);

-- Interest requests indexes
CREATE INDEX IF NOT EXISTS idx_interest_requests_outing_id ON interest_requests(outing_id);
CREATE INDEX IF NOT EXISTS idx_interest_requests_requester ON interest_requests(requester_user_id);
CREATE INDEX IF NOT EXISTS idx_interest_requests_status ON interest_requests(status);

-- Composite index for most common query pattern (outings list)
CREATE INDEX IF NOT EXISTS idx_outings_closed_created ON outings(is_closed, created_at DESC);
