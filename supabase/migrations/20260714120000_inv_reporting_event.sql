-- KPI UPDATES: an append-only audit log of activity on a portfolio company's
-- reporting — requests sent, reminders, recipients added, portco submissions
-- received, and investor edits to KPI values. Distinct from the generic
-- `activities` table: this is a purpose-built, queryable feed scoped by
-- (company, organization) so the company page can render "KPI Updates" without
-- filtering a global activity stream.
--
-- Rows are never mutated after insert. Investor-side events are written by our
-- TS helpers (lib/v2/reporting/events.ts) through the RLS user client; the
-- submission_received event is written by the trigger below because the portco
-- app writes submissions via the service role and cannot call our helpers.
CREATE TABLE IF NOT EXISTS inv_reporting_event (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    company_id        BIGINT NOT NULL,

    event_type        TEXT NOT NULL CHECK (event_type IN (
                          'request_sent',
                          'reminder_sent',
                          'recipient_added',
                          'submission_received',
                          'kpi_value_edited'
                      )),
    actor_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    payload           JSONB NOT NULL DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Pin the event's company to the same org (composite-FK tenancy guard, matching
    -- the rest of the reporting module).
    CONSTRAINT inv_reporting_event_company_org_fk
        FOREIGN KEY (company_id, organization_id)
        REFERENCES inv_company(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inv_reporting_event_company ON inv_reporting_event(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_reporting_event_org ON inv_reporting_event(organization_id);

-- RLS: org-scoped read + append for the investor's RLS user client. The log is
-- append-only, so there is deliberately no UPDATE or DELETE policy — authenticated
-- users can read the feed and insert investor-side events but never mutate history.
-- Portco/service-role writes bypass RLS; the composite FK is what pins org/company
-- for those.
ALTER TABLE inv_reporting_event ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_access" ON inv_reporting_event;
DROP POLICY IF EXISTS "org_access_select" ON inv_reporting_event;
CREATE POLICY "org_access_select" ON inv_reporting_event FOR SELECT
    USING (organization_id = public.user_organization_id());

DROP POLICY IF EXISTS "org_access_insert" ON inv_reporting_event;
CREATE POLICY "org_access_insert" ON inv_reporting_event FOR INSERT
    WITH CHECK (organization_id = public.user_organization_id());

-- The portco app writes inv_reporting_submission via the service role and cannot
-- call our TS event helpers, so emit the submission_received event here. Fires on
-- first submit and again on any re-submit after a reopen (a second event is
-- intended — each submission is a distinct reporting action worth logging).
CREATE OR REPLACE FUNCTION inv_reporting_event_on_submission()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'submitted'
        AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
    THEN
        INSERT INTO inv_reporting_event (organization_id, company_id, event_type, actor_user_id, payload)
        VALUES (
            NEW.organization_id,
            NEW.company_id,
            'submission_received',
            NEW.submitted_by,
            jsonb_build_object(
                'submissionType', NEW.type,
                'periodYear', NEW.period_year,
                'periodQuarter', NEW.period_quarter,
                'submissionId', NEW.id
            )
        );
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS inv_reporting_event_on_submission_trg ON inv_reporting_submission;
CREATE TRIGGER inv_reporting_event_on_submission_trg
    AFTER INSERT OR UPDATE ON inv_reporting_submission
    FOR EACH ROW EXECUTE FUNCTION inv_reporting_event_on_submission();
