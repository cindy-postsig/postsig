-- Allow MCP tokens to be revealed again from the settings UI by storing an
-- AES-256-GCM ciphertext alongside the hash. The hash is still the only thing
-- consulted at auth time; the ciphertext is only ever decrypted by an explicit
-- "reveal" action initiated by the owner.
--
-- Column holds base64 of: iv(12 bytes) || authTag(16 bytes) || ciphertext.
-- Nullable so historical rows minted via the CLI remain valid (auth still
-- works) but cannot be revealed in the UI.

ALTER TABLE public.mcp_api_tokens
    ADD COLUMN IF NOT EXISTS token_encrypted text;
