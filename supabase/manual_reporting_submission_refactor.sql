-- MANUAL, DATA-PRESERVING transform: inv_reporting_pack -> inv_reporting_submission (Option C).
-- Run once on each existing DB (local + dev remote) that still has the old schema.
-- Idempotent: no-op if already applied (the old table is gone). NOT placed under
-- migrations/ on purpose — the create migrations were edited in place to the new
-- shape, so a fresh `db reset` already lands here; this only migrates live data.

DO $$
DECLARE
  p RECORD;
  new_id BIGINT;
  has_kpis BOOLEAN;
  has_docs BOOLEAN;
BEGIN
  IF to_regclass('public.inv_reporting_pack') IS NULL THEN
    RAISE NOTICE 'inv_reporting_pack absent; refactor already applied, skipping';
    RETURN;
  END IF;

  -- 1. Rename table + add the new columns (type filled during the split below).
  ALTER TABLE inv_reporting_pack RENAME TO inv_reporting_submission;
  ALTER TABLE inv_reporting_submission
    ADD COLUMN type         TEXT,
    ADD COLUMN status       TEXT NOT NULL DEFAULT 'draft',
    ADD COLUMN submitted_at TIMESTAMPTZ,
    ADD COLUMN submitted_by UUID REFERENCES users(id) ON DELETE SET NULL;

  -- 2. Rename the child FK columns.
  ALTER TABLE inv_kpi_value          RENAME COLUMN pack_id TO submission_id;
  ALTER TABLE inv_reporting_document RENAME COLUMN pack_id TO submission_id;
  ALTER TABLE inv_reporting_request  RENAME COLUMN pack_id TO submission_id;

  -- 3. Drop the old (company, period) uniqueness BEFORE splitting, so a quarter
  --    can hold both a 'kpi' and a 'reporting_pack' submission.
  ALTER TABLE inv_reporting_submission
    DROP CONSTRAINT inv_reporting_pack_company_period_uq;

  -- 4. Split each pack into typed submissions. The existing row keeps its KPI
  --    values (-> 'kpi'); if it also has documents, spin off a 'reporting_pack'
  --    submission and move the docs there. A docs-only pack just becomes the
  --    'reporting_pack' submission.
  FOR p IN SELECT id, organization_id, company_id, period_year, period_quarter
           FROM inv_reporting_submission LOOP
    has_kpis := EXISTS(SELECT 1 FROM inv_kpi_value WHERE submission_id = p.id);
    has_docs := EXISTS(SELECT 1 FROM inv_reporting_document WHERE submission_id = p.id);

    IF has_docs AND NOT has_kpis THEN
      UPDATE inv_reporting_submission SET type = 'reporting_pack' WHERE id = p.id;
    ELSE
      UPDATE inv_reporting_submission SET type = 'kpi' WHERE id = p.id;
      IF has_docs THEN
        INSERT INTO inv_reporting_submission
          (organization_id, company_id, type, period_year, period_quarter)
        VALUES
          (p.organization_id, p.company_id, 'reporting_pack', p.period_year, p.period_quarter)
        RETURNING id INTO new_id;
        UPDATE inv_reporting_document SET submission_id = new_id WHERE submission_id = p.id;
      END IF;
    END IF;
  END LOOP;

  -- 5. Lock down the new columns + the new uniqueness key.
  ALTER TABLE inv_reporting_submission ALTER COLUMN type SET NOT NULL;
  ALTER TABLE inv_reporting_submission
    ADD CONSTRAINT inv_reporting_submission_type_chk   CHECK (type IN ('kpi','reporting_pack')),
    ADD CONSTRAINT inv_reporting_submission_status_chk CHECK (status IN ('draft','submitted','reopened')),
    ADD CONSTRAINT inv_reporting_submission_company_period_type_uq
      UNIQUE (company_id, period_year, period_quarter, type);

  -- 6. Re-link each request to its same-type submission, and carry submitted state
  --    onto the submission (lifecycle now lives there, not on the request).
  UPDATE inv_reporting_request SET submission_id = NULL WHERE submission_id IS NOT NULL;
  UPDATE inv_reporting_request r
    SET submission_id = s.id
    FROM inv_reporting_submission s
    WHERE s.company_id = r.company_id AND s.period_year = r.period_year
      AND s.period_quarter = r.period_quarter AND s.type = r.request_type;

  UPDATE inv_reporting_submission s
    SET status = 'submitted', submitted_at = COALESCE(r.submitted_at, NOW())
    FROM inv_reporting_request r
    WHERE r.company_id = s.company_id AND r.period_year = s.period_year
      AND r.period_quarter = s.period_quarter AND r.request_type = s.type
      AND r.status = 'submitted';

  -- 7. Rename carried-over constraints / indexes / trigger for consistency.
  ALTER TABLE inv_reporting_submission RENAME CONSTRAINT inv_reporting_pack_id_org_uq
    TO inv_reporting_submission_id_org_uq;
  ALTER TABLE inv_reporting_submission RENAME CONSTRAINT inv_reporting_pack_id_org_company_uq
    TO inv_reporting_submission_id_org_company_uq;
  ALTER TABLE inv_reporting_submission RENAME CONSTRAINT inv_reporting_pack_company_org_fk
    TO inv_reporting_submission_company_org_fk;
  ALTER TABLE inv_kpi_value RENAME CONSTRAINT inv_kpi_value_pack_code_uq
    TO inv_kpi_value_submission_code_uq;
  ALTER TABLE inv_kpi_value RENAME CONSTRAINT inv_kpi_value_pack_org_fk
    TO inv_kpi_value_submission_org_fk;
  ALTER TABLE inv_reporting_document RENAME CONSTRAINT inv_reporting_document_pack_fk
    TO inv_reporting_document_submission_fk;

  ALTER INDEX idx_inv_reporting_pack_org      RENAME TO idx_inv_reporting_submission_org;
  ALTER INDEX idx_inv_reporting_pack_company  RENAME TO idx_inv_reporting_submission_company;
  ALTER INDEX idx_inv_kpi_value_pack          RENAME TO idx_inv_kpi_value_submission;
  ALTER INDEX idx_inv_reporting_document_pack RENAME TO idx_inv_reporting_document_submission;
  CREATE INDEX IF NOT EXISTS idx_inv_reporting_submission_status
    ON inv_reporting_submission(organization_id, status);

  ALTER TRIGGER set_inv_reporting_pack_updated_at ON inv_reporting_submission
    RENAME TO set_inv_reporting_submission_updated_at;

  -- 8. Tidy auto-named objects (PK, public_id unique, request FK).
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inv_reporting_pack_pkey') THEN
    ALTER TABLE inv_reporting_submission RENAME CONSTRAINT inv_reporting_pack_pkey
      TO inv_reporting_submission_pkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inv_reporting_pack_public_id_key') THEN
    ALTER TABLE inv_reporting_submission RENAME CONSTRAINT inv_reporting_pack_public_id_key
      TO inv_reporting_submission_public_id_key;
  END IF;
  -- Replace the single-column submission FK with a tenant-pinned composite FK.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inv_reporting_request_pack_id_fkey') THEN
    ALTER TABLE inv_reporting_request DROP CONSTRAINT inv_reporting_request_pack_id_fkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inv_reporting_request_submission_org_fk') THEN
    ALTER TABLE inv_reporting_request
      ADD CONSTRAINT inv_reporting_request_submission_org_fk
      FOREIGN KEY (submission_id, organization_id)
      REFERENCES inv_reporting_submission(id, organization_id)
      ON DELETE SET NULL (submission_id);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inv_reporting_pack_organization_id_fkey') THEN
    ALTER TABLE inv_reporting_submission RENAME CONSTRAINT inv_reporting_pack_organization_id_fkey
      TO inv_reporting_submission_organization_id_fkey;
  END IF;

  RAISE NOTICE 'inv_reporting_pack -> inv_reporting_submission refactor complete';
END $$;
