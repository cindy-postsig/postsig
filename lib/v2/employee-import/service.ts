import {
  addOrgEmployees,
  type BulkImportResult,
} from '@/data/superuser/org-employees';
import { buildEmployeeRow } from '@/data/superuser/_employee-row';
import { recordEmployeeImportRun } from '@/data/superuser/employee-import-runs';
import { todayIsoDate } from '@/lib/settings/employee-form';
import { createClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import { computeImportDelta, type ExistingEmployeeState } from './delta';
import {
  describeColumns,
  guessHasHeaderRow,
  autoDetectMapping,
} from './describe-columns';
import {
  matchBusinessGroups,
  normalizeGroupName,
  type GroupMatchPair,
  type MatchedGroup,
} from './groups';
import { getSavedImportMapping } from './mapping-store';
import { parseImportFile } from './parse-file';
import { resolveRows } from './resolve-rows';
import type {
  ColumnDescriptor,
  EmployeeImportMapping,
  ImportTargetField,
  ResolvedEmployeeRow,
} from './types';

const MAX_SAMPLE_ROWS = 10;
const MAX_INVALID_ROWS = 50;

export type ImportPreview = {
  total: number;
  valid: number;
  invalid: number;
  /** Null while mapping: counting scans the whole directory, so it is done
   *  only for the final full preview rather than on every debounced edit. */
  newCount: number | null;
  updateCount: number | null;
  invalidRows: { rowNumber: number; reasons: string[] }[];
  sampleRows: ResolvedEmployeeRow[];
  isCompleteSample: boolean;
  unmappedValues: Partial<Record<ImportTargetField, string[]>>;
  sourceValues: Partial<Record<ImportTargetField, string[]>>;
  matchedBusinessGroups: GroupMatchPair[];
  unresolvedBusinessGroups: string[];
};

export type CommitResponse = BulkImportResult & {
  /** Delta report run; null when this import seeded an empty directory. */
  importRunId: number | null;
};

export type PreviewResponse = {
  file: {
    sheetNames: string[];
    sheetName: string;
    rowCount: number;
    columns: ColumnDescriptor[];
    guessedHasHeaderRow: boolean;
  };
  savedMapping: EmployeeImportMapping | null;
  autoDetected: EmployeeImportMapping['fields'];
  preview: ImportPreview | null;
};

const EXISTING_STATE_SELECT =
  'id, employee_id, email, first_name, last_name, region, country, division, department, cost_center, business_unit, entity, team, start_date, leave_date, status';

function businessGroupNames(rows: ResolvedEmployeeRow[]): string[] {
  return Array.from(
    new Set(rows.map((r) => r.business_group).filter((n) => n !== '')),
  );
}

const DB_PAGE_SIZE = 1000;

async function loadExistingEmployees(
  organizationId: string,
): Promise<ExistingEmployeeState[]> {
  const supabase = createClient();
  const all: ExistingEmployeeState[] = [];

  for (let offset = 0; ; offset += DB_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('org_employees')
      .select(EXISTING_STATE_SELECT)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .order('id')
      .range(offset, offset + DB_PAGE_SIZE - 1);

    if (error) throw error;
    all.push(...(data ?? []));
    if (!data || data.length < DB_PAGE_SIZE) break;
  }

  return all;
}

function countExisting(
  rows: ResolvedEmployeeRow[],
  existing: Pick<ExistingEmployeeState, 'employee_id' | 'email'>[],
): { newCount: number; updateCount: number } {
  const byEmployeeId = new Set(
    existing.map((e) => e.employee_id).filter((v): v is string => !!v),
  );
  const byEmail = new Set(
    existing.map((e) => e.email?.toLowerCase()).filter((v): v is string => !!v),
  );

  let updateCount = 0;
  for (const row of rows) {
    if (!row.isValid) continue;
    const matched =
      (row.employee_id && byEmployeeId.has(row.employee_id)) ||
      (row.email && byEmail.has(row.email.toLowerCase()));
    if (matched) updateCount += 1;
  }

  const valid = rows.filter((r) => r.isValid).length;
  return { newCount: valid - updateCount, updateCount };
}

export async function previewImport(
  organizationId: string,
  file: File,
  mapping: EmployeeImportMapping | undefined,
  includeAllRows = false,
): Promise<PreviewResponse> {
  const savedMapping = await getSavedImportMapping();
  const effective = mapping ?? savedMapping ?? undefined;

  const sheet = await parseImportFile(file, effective?.sheetName);
  const guessedHasHeaderRow = guessHasHeaderRow(sheet.rows);
  const hasHeaderRow = effective?.hasHeaderRow ?? guessedHasHeaderRow;
  const columns = describeColumns(sheet.rows, hasHeaderRow, sheet.columnCount);

  const response: PreviewResponse = {
    file: {
      sheetNames: sheet.sheetNames,
      sheetName: sheet.sheetName,
      rowCount: hasHeaderRow ? sheet.rows.length - 1 : sheet.rows.length,
      columns,
      guessedHasHeaderRow,
    },
    savedMapping,
    autoDetected: savedMapping ? {} : autoDetectMapping(columns),
    preview: null,
  };

  if (!effective) return response;

  const { rows, unmappedValues, sourceValues } = resolveRows(
    sheet.rows,
    effective,
    { today: todayIsoDate() },
  );

  const groupNames = businessGroupNames(rows);
  const { matched, unmatched } = groupNames.length
    ? await matchBusinessGroups(organizationId, groupNames)
    : { matched: [] as GroupMatchPair[], unmatched: [] as string[] };

  // loadExistingIdentifiers pages through every employee in the org, so skip it
  // while the user is still editing the mapping and only count for the final
  // preview the Import button acts on.
  const counts = includeAllRows
    ? countExisting(rows, await loadExistingEmployees(organizationId))
    : { newCount: null, updateCount: null };

  response.preview = {
    total: rows.length,
    valid: rows.filter((r) => r.isValid).length,
    invalid: rows.filter((r) => !r.isValid).length,
    newCount: counts.newCount,
    updateCount: counts.updateCount,
    invalidRows: rows
      .filter((r) => !r.isValid)
      .slice(0, MAX_INVALID_ROWS)
      .map((r) => ({ rowNumber: r.rowNumber, reasons: r.invalidReasons })),
    sampleRows: includeAllRows ? rows : rows.slice(0, MAX_SAMPLE_ROWS),
    isCompleteSample: includeAllRows,
    unmappedValues,
    sourceValues,
    matchedBusinessGroups: matched,
    unresolvedBusinessGroups: unmatched,
  };

  return response;
}

export async function commitImport(
  organizationId: string,
  file: File,
  mapping: EmployeeImportMapping,
  importedBy: string | null = null,
): Promise<CommitResponse> {
  const sheet = await parseImportFile(file, mapping.sheetName);
  const { rows } = resolveRows(sheet.rows, mapping, { today: todayIsoDate() });

  // Business-group nodes are created up front from the value map, so the
  // import only has to match names it already expects to exist. A name with no
  // node imports with none.
  const groupNames = businessGroupNames(rows);
  const { byName } = groupNames.length
    ? await matchBusinessGroups(organizationId, groupNames)
    : { byName: new Map<string, MatchedGroup>() };

  const payload = rows
    .filter((row) => row.isValid)
    .map((row) => ({
      organization_id: organizationId,
      sourceRowIndex: row.rowNumber - 1,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email || undefined,
      employee_id: row.employee_id || undefined,
      region: row.region || undefined,
      country: row.country || undefined,
      division: row.division || undefined,
      department: row.department || undefined,
      cost_center: row.cost_center || undefined,
      business_unit: row.business_unit || undefined,
      entity: row.entity || undefined,
      team: row.team || undefined,
      start_date: row.start_date || undefined,
      leave_date: row.leave_date || undefined,
      business_group_node_id: row.business_group
        ? byName.get(normalizeGroupName(row.business_group))?.id
        : undefined,
      ...(row.status ? { status: row.status } : {}),
    }));

  // Snapshot the directory before the write: the delta report compares this
  // state against the file, and the upsert below destroys it.
  const existing = await loadExistingEmployees(organizationId);

  const result = await addOrgEmployees(payload);

  let importRunId: number | null = null;
  // An import into an empty directory seeds the baseline; there is nothing to
  // diff against, so no report run is recorded for it.
  if (existing.length > 0) {
    try {
      const failedRowIndexes = new Set(result.errors.map((e) => e.rowIndex));
      const incoming = payload
        .filter((row) => !failedRowIndexes.has(row.sourceRowIndex))
        .map((row) => buildEmployeeRow(row));
      const delta = computeImportDelta(existing, incoming);
      importRunId = await recordEmployeeImportRun({
        organizationId,
        fileName: file.name,
        importedBy,
        rowCount: payload.length,
        previousEmployeeCount: existing.length,
        changes: delta.changes,
      });
    } catch (error) {
      // The employees are already written; a missing report must not turn a
      // successful import into a failure.
      logger.error(
        { error: sanitizeForLogging(error), organizationId },
        'Failed to record employee import delta report',
      );
    }
  }

  return { ...result, importRunId };
}
