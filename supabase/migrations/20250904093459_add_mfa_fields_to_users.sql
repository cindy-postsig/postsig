-- Add MFA-related fields to users table
ALTER TABLE users
  ADD COLUMN mfa_enabled boolean DEFAULT false,
  ADD COLUMN backup_codes_generated boolean DEFAULT false,
  ADD COLUMN backup_codes_used jsonb DEFAULT '[]';

-- Add index for faster MFA queries
CREATE INDEX idx_users_mfa_enabled ON users(mfa_enabled) WHERE mfa_enabled = true;

-- Add comment for documentation
COMMENT ON COLUMN users.mfa_enabled IS 'Whether user has enabled multi-factor authentication';
COMMENT ON COLUMN users.backup_codes_generated IS 'Whether backup codes have been generated for this user';
COMMENT ON COLUMN users.backup_codes_used IS 'Array of used backup code hashes for recovery access';