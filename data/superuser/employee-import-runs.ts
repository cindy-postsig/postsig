import 'server-only';

import { createClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import type { ImportDeltaChange } from '@/lib/v2/employee-import/delta';

export type EmployeeImportRun = {
  id: number;
  organization_id: string;
  file_name: string;
  imported_by: string | null;
  row_count: number;
  previous_employee_count: number;
  previous_run_id: number | null;
  changes: ImportDeltaChange[];
  created_at: string;
};

/** The baseline shown in the report header: the run the delta was taken against. */
export type EmployeeImportRunSummary = {
  id: number;
  file_name: string;
  row_count: number;
  created_at: string;
};

const RUN_SELECT =
  'id, organization_id, file_name, imported_by, row_count, previous_employee_count, previous_run_id, changes, created_at';

/**
 * Inserts the delta run captured by an import commit and returns its id.
 * Authorization is the import route's: this module is server-only and every
 * caller has already passed verifyAbility + org checks in addOrgEmployees.
 */
export async function recordEmployeeImportRun(params: {
  organizationId: string;
  fileName: string;
  importedBy: string | null;
  rowCount: number;
  previousEmployeeCount: number;
  changes: ImportDeltaChange[];
}): Promise<number> {
  const supabase = createClient();

  // The service client bypasses RLS, so scope the lookup explicitly.
  const { data: latest, error: latestError } = await supabase
    .from('org_employee_import_runs')
    .select('id')
    .eq('organization_id', params.organizationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) throw latestError;

  const { data, error } = await supabase
    .from('org_employee_import_runs')
    .insert({
      organization_id: params.organizationId,
      file_name: params.fileName,
      imported_by: params.importedBy,
      row_count: params.rowCount,
      previous_employee_count: params.previousEmployeeCount,
      previous_run_id: latest?.id ?? null,
      changes: params.changes,
    })
    .select('id')
    .single();

  if (error) {
    logger.error(
      {
        error: sanitizeForLogging(error),
        organizationId: params.organizationId,
      },
      'Failed to record employee import run',
    );
    throw error;
  }
  return data.id;
}

export async function getEmployeeImportRun(
  organizationId: string,
  runId: number,
): Promise<{
  run: EmployeeImportRun;
  baseline: EmployeeImportRunSummary | null;
} | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('org_employee_import_runs')
    .select(RUN_SELECT)
    .eq('organization_id', organizationId)
    .eq('id', runId)
    .maybeSingle();

  if (error) {
    logger.error(
      { error: sanitizeForLogging(error), organizationId, runId },
      'Failed to load employee import run',
    );
    throw error;
  }
  if (!data) return null;

  const run: EmployeeImportRun = {
    ...data,
    changes: (data.changes ?? []) as ImportDeltaChange[],
  };

  if (run.previous_run_id === null) return { run, baseline: null };

  const { data: baseline, error: baselineError } = await supabase
    .from('org_employee_import_runs')
    .select('id, file_name, row_count, created_at')
    .eq('organization_id', organizationId)
    .eq('id', run.previous_run_id)
    .maybeSingle();

  if (baselineError) {
    logger.error(
      { error: sanitizeForLogging(baselineError), organizationId, runId },
      'Failed to load employee import baseline run',
    );
    throw baselineError;
  }
  return { run, baseline };
}

export async function getLatestEmployeeImportRunId(
  organizationId: string,
): Promise<number | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('org_employee_import_runs')
    .select('id')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error(
      { error: sanitizeForLogging(error), organizationId },
      'Failed to load latest employee import run',
    );
    throw error;
  }
  return data?.id ?? null;
}
