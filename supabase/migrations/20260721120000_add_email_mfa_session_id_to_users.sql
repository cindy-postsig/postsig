alter table users
  add column email_mfa_session_id text;

comment on column users.email_mfa_session_id is
  'Supabase auth session_id (gotrue claim) that last completed the email MFA challenge. Paired with email_mfa_session_verified_at to session-scope email MFA so a verification on one device cannot satisfy another. NULL = treated as no match (re-prompts).';
