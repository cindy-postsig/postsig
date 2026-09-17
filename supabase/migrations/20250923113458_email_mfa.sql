-- Add email MFA support to users table
ALTER TABLE users
  ADD COLUMN mfa_type VARCHAR(10) DEFAULT NULL,
  ADD COLUMN email_mfa_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN email_mfa_secret VARCHAR(255) DEFAULT NULL,
  ADD COLUMN email_mfa_last_sent TIMESTAMP DEFAULT NULL,
  ADD COLUMN email_mfa_attempts INTEGER DEFAULT 0;

-- Add check constraint for mfa_type
ALTER TABLE users
  ADD CONSTRAINT mfa_type_check
  CHECK (mfa_type IN ('totp', 'email') OR mfa_type IS NULL);

-- Add index for email MFA queries
CREATE INDEX idx_users_email_mfa_enabled ON users(email_mfa_enabled) WHERE email_mfa_enabled = true;

-- Add comments for documentation
COMMENT ON COLUMN users.mfa_type IS 'Type of MFA enabled: totp, email, or NULL if disabled';
COMMENT ON COLUMN users.email_mfa_enabled IS 'Whether user has enabled email-based MFA';
COMMENT ON COLUMN users.email_mfa_secret IS 'Hashed secret for current email MFA session (temporary)';
COMMENT ON COLUMN users.email_mfa_last_sent IS 'Timestamp of last email MFA code sent for rate limiting';
COMMENT ON COLUMN users.email_mfa_attempts IS 'Number of failed verification attempts for current session';

drop policy "Users can update own profile." on "public"."users";

alter table "public"."users" add column "email_mfa_session_verified_at" timestamp with time zone;

alter table "public"."users" alter column "email_mfa_last_sent" set data type timestamp with time zone using "email_mfa_last_sent"::timestamp with time zone;

create policy "Users can update own profile."
on "public"."users"
as permissive
for update
to public
using ((auth.uid() = id))
with check (((auth.uid() = id) AND (email_mfa_enabled = email_mfa_enabled) AND ((email_mfa_secret)::text = (email_mfa_secret)::text) AND (email_mfa_last_sent = email_mfa_last_sent) AND (email_mfa_attempts = email_mfa_attempts)));



