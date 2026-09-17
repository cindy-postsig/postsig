-- A first-class status for a vendors row retired as a duplicate of another.
--
-- 'merged' and 'acquired' mean a corporate action happened: a contract can
-- legitimately name the old vendor, so ingestion and pickers must keep
-- offering it. A duplicate is the same company entered twice; once merged,
-- nothing should ever be stamped with its id again. Consumers filter on
-- 'duplicate' precisely and leave the corporate-action statuses alone.
--
-- Added in its own migration: a new enum value cannot be used in the
-- transaction that adds it, and 20260911120000_vendor_merge_functions.sql
-- extends current_vendors to resolve through it.

ALTER TYPE "public"."VendorStatus" ADD VALUE IF NOT EXISTS 'duplicate';
