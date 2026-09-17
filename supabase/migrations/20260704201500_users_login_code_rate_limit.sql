-- Rate-limit columns for the portco app's email login codes. Kept separate from
-- the email_mfa_* columns, which belong to the investor app's MFA flow.
ALTER TABLE users
  ADD COLUMN login_code_last_sent timestamptz,
  ADD COLUMN login_code_attempts integer;
