-- Migration: Add MFA trust cycle tracking
-- Add mfa_last_verified_at field to track TOTP MFA verification timestamp for 14-day trust cycle

ALTER TABLE public.users
  ADD COLUMN mfa_last_verified_at TIMESTAMP WITH TIME ZONE;

-- Index for efficient trust cycle queries
CREATE INDEX idx_users_mfa_last_verified
  ON public.users(mfa_last_verified_at)
  WHERE mfa_enabled = true;

-- Comment for documentation
COMMENT ON COLUMN public.users.mfa_last_verified_at IS
  'Timestamp of last successful MFA verification for trust cycle tracking';
