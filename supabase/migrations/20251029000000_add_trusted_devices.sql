-- Migration: 20251029000000_add_trusted_devices.sql
-- Add trusted_devices table for 7-day MFA trust cycle with device fingerprinting

CREATE TABLE IF NOT EXISTS "public"."trusted_devices" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_fingerprint TEXT NOT NULL,
  device_token TEXT NOT NULL UNIQUE,
  device_name TEXT,
  device_info JSONB, -- browser, OS, location info
  trusted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for efficient lookups
CREATE INDEX idx_trusted_devices_user_id ON trusted_devices(user_id);
CREATE INDEX idx_trusted_devices_token ON trusted_devices(device_token);
CREATE INDEX idx_trusted_devices_fingerprint ON trusted_devices(device_fingerprint);
CREATE INDEX idx_trusted_devices_expires_at ON trusted_devices(expires_at);


-- Enable RLS
ALTER TABLE "public"."trusted_devices" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own trusted devices
CREATE POLICY "Users can view own trusted devices"
  ON "public"."trusted_devices"
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own trusted devices
CREATE POLICY "Users can insert own trusted devices"
  ON "public"."trusted_devices"
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own trusted devices
CREATE POLICY "Users can update own trusted devices"
  ON "public"."trusted_devices"
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own trusted devices
CREATE POLICY "Users can delete own trusted devices"
  ON "public"."trusted_devices"
  FOR DELETE
  USING (auth.uid() = user_id);