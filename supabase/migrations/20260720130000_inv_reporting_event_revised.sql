-- Capture portco revisions to already-submitted reporting in the KPI Updates
-- feed. The portco app lets a submitter edit within an edit window after the
-- first submit: it rewrites the KPI values and re-saves the submission row with
-- status still 'submitted'. The original trigger only fired on INSERT or a
-- status change, so those in-place revisions were invisible in the feed. Add a
-- distinct 'submission_revised' event so a revision reads differently from the
-- initial submission.

-- NOT VALID + a separate VALIDATE keeps the constraint swap from scanning the
-- append-only event table under a write-blocking lock.
ALTER TABLE inv_reporting_event
    DROP CONSTRAINT IF EXISTS inv_reporting_event_event_type_check;

ALTER TABLE inv_reporting_event
    ADD CONSTRAINT inv_reporting_event_event_type_check CHECK (event_type IN (
        'request_sent',
        'reminder_sent',
        'recipient_added',
        'submission_received',
        'submission_revised',
        'kpi_value_edited'
    )) NOT VALID;

ALTER TABLE inv_reporting_event
    VALIDATE CONSTRAINT inv_reporting_event_event_type_check;

-- First submit (INSERT as submitted, or a draft/reopened row transitioning to
-- submitted) logs 'submission_received'. Re-saving a row that is already
-- submitted — the edit-window revision path — logs 'submission_revised'. The
-- revised values themselves live in child tables (inv_kpi_value /
-- inv_reporting_document); the submission row is only re-touched by the app's
-- submit path, which always writes status/submitted_at/submitted_by. Scoping
-- the trigger to those columns (below) keeps an unrelated column update from
-- being mistaken for a revision.
CREATE OR REPLACE FUNCTION inv_reporting_event_on_submission()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    resolved_event_type TEXT;
BEGIN
    IF NEW.status <> 'submitted' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
        resolved_event_type := 'submission_received';
    ELSE
        resolved_event_type := 'submission_revised';
    END IF;

    INSERT INTO inv_reporting_event (organization_id, company_id, event_type, actor_user_id, payload)
    VALUES (
        NEW.organization_id,
        NEW.company_id,
        resolved_event_type,
        NEW.submitted_by,
        jsonb_build_object(
            'submissionType', NEW.type,
            'periodYear', NEW.period_year,
            'periodQuarter', NEW.period_quarter,
            'submissionId', NEW.id
        )
    );
    RETURN NEW;
END $$;

-- Re-scope from the original AFTER INSERT OR UPDATE: only a submit/re-submit
-- writes status, submitted_at, or submitted_by, so an UPDATE touching none of
-- them (unrelated metadata) no longer fires a spurious 'submission_revised'.
DROP TRIGGER IF EXISTS inv_reporting_event_on_submission_trg ON inv_reporting_submission;
CREATE TRIGGER inv_reporting_event_on_submission_trg
    AFTER INSERT OR UPDATE OF status, submitted_at, submitted_by ON inv_reporting_submission
    FOR EACH ROW EXECUTE FUNCTION inv_reporting_event_on_submission();
