import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { formatPeriodLabel, isFreemailDomain } from './transforms';
import { getHiddenKpiIds } from './kpi-settings';
import { createOrgReadClient } from './read-client';
import type {
  CompanyCustomKpi,
  CustomKpiValueType,
  KpiDefinition,
  KpiScalar,
  KpiValueType,
  PendingRequest,
  PortcoUserOption,
  ReportingDocTypeOption,
  ReportingQuarter,
  ReportingRequestDetails,
  RequestRecipient,
  StandardKpiOverride,
} from './types';

const unwrap = <T>(relation: T | T[] | null): T | null =>
  Array.isArray(relation) ? (relation[0] ?? null) : relation;

export async function getCompanyReportingRequests(
  companyId: number,
): Promise<PendingRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('inv_reporting_request')
    .select(
      `
        public_id,
        request_type,
        period_year,
        period_quarter,
        status,
        sent_at,
        last_reminder_at,
        created_at,
        inv_reporting_request_kpi ( count ),
        inv_reporting_request_document ( count ),
        inv_reporting_request_recipient ( email, invited_at )
      `,
    )
    .eq('company_id', companyId)
    .eq('status', 'sent')
    .order('created_at', { ascending: false });

  if (error) {
    logger.error({ error, companyId }, 'Failed to fetch reporting requests');
    return [];
  }

  // Fill progress = how many values/documents a non-submitted submission of the
  // same period+type carries. Only counts are surfaced — never draft values.
  const { data: drafts } = await supabase
    .from('inv_reporting_submission')
    .select(
      'type, period_year, period_quarter, inv_kpi_value(count), inv_reporting_document(count)',
    )
    .eq('company_id', companyId)
    .neq('status', 'submitted');
  const draftKey = (year: number, quarter: number | null, type: string) =>
    `${year}-${quarter ?? 'FY'}-${type}`;
  const draftCounts = new Map(
    (drafts ?? []).map((d) => [
      draftKey(d.period_year, d.period_quarter, d.type),
      d.type === 'kpi'
        ? (d.inv_kpi_value?.[0]?.count ?? 0)
        : (d.inv_reporting_document?.[0]?.count ?? 0),
    ]),
  );

  return (data ?? []).map((r) => {
    const requestType = r.request_type as 'kpi' | 'reporting_pack';
    // The earliest-invited recipient represents the request in the list view.
    const representative = (r.inv_reporting_request_recipient ?? [])
      .slice()
      .sort((a, b) => a.invited_at.localeCompare(b.invited_at))[0];
    return {
      publicId: r.public_id,
      requestType,
      periodYear: r.period_year,
      periodQuarter: r.period_quarter,
      periodLabel: formatPeriodLabel(r.period_quarter, r.period_year),
      recipientEmail: representative?.email ?? '',
      status: r.status,
      itemCount:
        requestType === 'kpi'
          ? (r.inv_reporting_request_kpi?.[0]?.count ?? 0)
          : (r.inv_reporting_request_document?.[0]?.count ?? 0),
      sentAt: r.sent_at,
      lastReminderAt: r.last_reminder_at,
      filledCount:
        draftCounts.get(
          draftKey(r.period_year, r.period_quarter, requestType),
        ) ?? 0,
    };
  });
}

export async function getReportingRequestDetails(
  publicId: string,
): Promise<ReportingRequestDetails | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('inv_reporting_request')
    .select(
      `
        message,
        inv_company ( domain ),
        inv_reporting_request_kpi (
          kpi_id,
          sort_order,
          inv_kpi ( label, category, organization_id )
        ),
        inv_reporting_request_document ( doc_type_id, custom_doc_type, sort_order )
      `,
    )
    .eq('public_id', publicId)
    .maybeSingle();

  if (error) {
    logger.error(
      { error, publicId },
      'Failed to fetch reporting request details',
    );
    return null;
  }
  if (!data) return null;

  // The FK embed resolves the def even when it was later deactivated
  // (is_active false), so an immutable request still renders its KPI labels.
  const kpis = (data.inv_reporting_request_kpi ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((k) => {
      const def = unwrap(k.inv_kpi);
      return {
        id: k.kpi_id,
        label: def?.label ?? 'Removed KPI',
        category: def?.category ?? '',
        isCustom: def?.organization_id != null,
      };
    });
  const docs = (data.inv_reporting_request_document ?? []).sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  return {
    kpis,
    docTypeIds: docs
      .filter((d) => d.doc_type_id != null)
      .map((d) => d.doc_type_id as number),
    customDocLabels: docs
      .filter((d) => d.custom_doc_type != null)
      .map((d) => d.custom_doc_type as string),
    message: data.message ?? null,
    companyDomain: unwrap(data.inv_company)?.domain ?? null,
  };
}

// Recipients are a flat set ordered by when they were invited; the earliest is
// the request's representative recipient (there is no stored "primary").
export async function getReportingRequestRecipients(
  publicId: string,
): Promise<RequestRecipient[]> {
  const supabase = await createClient();
  const { data: req } = await supabase
    .from('inv_reporting_request')
    .select('inv_reporting_request_recipient(email, invited_at)')
    .eq('public_id', publicId)
    .order('invited_at', {
      referencedTable: 'inv_reporting_request_recipient',
    })
    .maybeSingle();
  if (!req) return [];

  return (req.inv_reporting_request_recipient ?? []).map((r) => ({
    email: r.email,
  }));
}

// Users already linked to this specific company, for the recipient autofill.
// Uses the service client because portco users are org-less external members —
// not investor-org members at all — so they are invisible to the investor
// through RLS; scoping is enforced here by organizationId.
export async function getOrgPortcoUsers(
  companyId: number,
  organizationId: string,
): Promise<PortcoUserOption[]> {
  const admin = createServiceClient();
  const { data: rows, error } = await admin
    .from('inv_portco_user')
    .select('users!inv_portco_user_user_id_fkey ( id, email, name )')
    .eq('company_id', companyId)
    .eq('organization_id', organizationId);
  if (error) {
    logger.error({ error, companyId }, 'Failed to list company portco users');
    return [];
  }

  const seen = new Set<string>();
  const options: PortcoUserOption[] = [];
  for (const row of rows ?? []) {
    const u = Array.isArray(row.users) ? row.users[0] : row.users;
    if (!u?.email || seen.has(u.id)) continue;
    seen.add(u.id);
    options.push({ id: u.id, email: u.email, name: u.name });
  }
  options.sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
  return options;
}

// All active KPI definitions visible to the org: global/standard rows
// (organization_id NULL) plus the org's own custom rows, one list. isCustom
// distinguishes them; description feeds UI tooltips. Hidden KPIs (the org's
// tracking selection) are excluded unless includeHidden is set — the settings
// page needs the full catalog to render the enable/disable toggles.
export async function getKpis(options?: {
  includeHidden?: boolean;
}): Promise<KpiDefinition[]> {
  const scope = await createOrgReadClient();
  if (!scope) return [];

  const { data, error } = await scope.supabase
    .from('inv_kpi')
    .select(
      'id, public_id, organization_id, code, label, category, value_type, unit, description, placeholder, sort_order, is_flow',
    )
    .eq('is_active', true)
    .or(`organization_id.is.null,organization_id.eq.${scope.organizationId}`)
    .order('sort_order', { ascending: true });

  if (error) {
    logger.error({ error }, 'Failed to fetch KPIs');
    return [];
  }

  const defs = (data ?? []).map((r) => ({
    id: r.id,
    publicId: r.public_id,
    code: r.code,
    label: r.label,
    category: r.category,
    valueType: r.value_type as KpiValueType,
    unit: r.unit,
    description: r.description,
    placeholder: r.placeholder,
    sortOrder: r.sort_order,
    isFlow: r.is_flow,
    isCustom: r.organization_id != null,
  }));

  if (options?.includeHidden) return defs;

  const hidden = new Set(await getHiddenKpiIds());
  return defs.filter((d) => !hidden.has(d.publicId));
}

export async function getReportingDocTypes(): Promise<
  ReportingDocTypeOption[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('inv_reporting_doc_type')
    .select('id, code, display_name, sort_order')
    .order('sort_order', { ascending: true });

  if (error) {
    logger.error({ error }, 'Failed to fetch reporting doc types');
    return [];
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    code: r.code,
    displayName: r.display_name,
    sortOrder: r.sort_order,
  }));
}

// Feeds the request dialog's confirm-domain field: shown only while no
// org-scoped domain is pinned, seeded with the registry domain as the
// suggestion (freemail-filtered — a freemail suggestion must never be offered
// as a sign-in gate).
export async function getCompanyDomainInfo(companyId: number): Promise<{
  companyDomain: string | null;
  suggestedDomain: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('inv_company')
    .select('domain, inv_companies ( domain )')
    .eq('id', companyId)
    .maybeSingle();

  if (error) {
    logger.error({ error, companyId }, 'Failed to fetch company domain info');
    return { companyDomain: null, suggestedDomain: null };
  }

  const registryDomain = unwrap(data?.inv_companies ?? null)?.domain ?? null;
  return {
    companyDomain: data?.domain ?? null,
    suggestedDomain:
      registryDomain && !isFreemailDomain(registryDomain)
        ? registryDomain
        : null,
  };
}

export async function getCompanyReporting(
  companyId: number,
): Promise<ReportingQuarter[]> {
  const scope = await createOrgReadClient();
  if (!scope) return [];

  // Option C: up to two submissions per quarter (one 'kpi', one 'reporting_pack'),
  // each owning only its own children. Merge them back into one card per quarter.
  const { data, error } = await scope.supabase
    .from('inv_reporting_submission')
    .select(
      `
        id,
        type,
        period_year,
        period_quarter,
        status,
        submitted_at,
        inv_kpi_value (
          value_numeric,
          value_text,
          updated_at,
          inv_kpi ( code, label, category, value_type, sort_order )
        ),
        inv_reporting_document (
          id,
          file_name,
          file_path,
          file_type,
          file_size,
          custom_doc_type,
          created_at,
          is_deleted,
          inv_reporting_doc_type ( display_name )
        )
      `,
    )
    .eq('company_id', companyId)
    .eq('organization_id', scope.organizationId)
    // Investors see only submitted submissions — drafts/in-progress stay private.
    .eq('status', 'submitted')
    .order('period_year', { ascending: false })
    .order('period_quarter', { ascending: false });

  if (error) {
    logger.error({ error, companyId }, 'Failed to fetch company reporting');
    return [];
  }

  const byQuarter = new Map<string, ReportingQuarter>();
  for (const sub of data ?? []) {
    const key = `${sub.period_year}-${sub.period_quarter}`;
    let quarter = byQuarter.get(key);
    if (!quarter) {
      quarter = {
        packId: sub.id,
        periodYear: sub.period_year,
        periodQuarter: sub.period_quarter,
        periodLabel: formatPeriodLabel(sub.period_quarter, sub.period_year),
        submittedAt: null,
        kpis: [],
        documents: [],
      };
      byQuarter.set(key, quarter);
    }
    // Prefer the KPI submission's id as the quarter's stable key.
    if (sub.type === 'kpi') quarter.packId = sub.id;

    for (const v of sub.inv_kpi_value ?? []) {
      const kpi = unwrap(v.inv_kpi);
      // Custom-KPI portco values (kpi.code NULL) surface in the custom payload
      // with provenance; the standard table shows only coded catalog KPIs.
      if (!kpi?.code) continue;
      quarter.kpis.push({
        code: kpi.code,
        label: kpi.label,
        category: kpi.category,
        valueType: kpi.value_type as KpiValueType,
        valueNumeric: v.value_numeric,
        valueText: v.value_text,
        sortOrder: kpi.sort_order,
        updatedAt: v.updated_at,
      });
    }

    for (const d of (sub.inv_reporting_document ?? []).filter(
      (x) => !x.is_deleted,
    )) {
      quarter.documents.push({
        id: d.id,
        fileName: d.file_name,
        filePath: d.file_path,
        fileType: d.file_type,
        fileSize: d.file_size,
        docType: unwrap(d.inv_reporting_doc_type)?.display_name ?? null,
        customDocType: d.custom_doc_type,
        createdAt: d.created_at,
      });
    }

    if (
      sub.submitted_at &&
      (!quarter.submittedAt || sub.submitted_at > quarter.submittedAt)
    ) {
      quarter.submittedAt = sub.submitted_at;
    }
  }

  const quarters = [...byQuarter.values()];
  for (const q of quarters) {
    q.kpis.sort((a, b) => a.sortOrder - b.sortOrder);
    q.documents.sort((a, b) => a.fileName.localeCompare(b.fileName));
  }
  return quarters;
}

// Org custom KPIs (org-scoped by RLS; org-wide now — no company scope on the
// def), each with this company's per-period cells. A cell carries both origins —
// a portco-submitted value and an investor-authored value can coexist — and the
// investor value wins for display (edited = an investor value is present).
// Cells come at all three granularities: portco submissions are quarterly or
// annual, document extraction also writes months.
export async function getCompanyCustomKpis(
  companyId: number,
): Promise<CompanyCustomKpi[]> {
  const scope = await createOrgReadClient();
  if (!scope) return [];

  const { data: defs, error } = await scope.supabase
    .from('inv_kpi')
    .select('id, public_id, label, category, value_type, is_flow')
    .eq('is_active', true)
    .eq('organization_id', scope.organizationId)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });

  if (error) {
    logger.error({ error, companyId }, 'Failed to fetch custom KPIs');
    return [];
  }
  const hidden = new Set(await getHiddenKpiIds());
  const list = (defs ?? []).filter((d) => !hidden.has(d.public_id));
  if (list.length === 0) return [];

  const { data: vals, error: valsError } = await scope.supabase
    .from('inv_kpi_value')
    .select(
      'kpi_id, period_year, period_quarter, period_month, origin, value_numeric, value_text, updated_at, inv_reporting_submission ( status )',
    )
    .eq('company_id', companyId)
    .eq('organization_id', scope.organizationId)
    .in(
      'kpi_id',
      list.map((d) => d.id),
    );

  if (valsError) {
    logger.error({ error: valsError, companyId }, 'Failed to fetch KPI values');
    return [];
  }

  type Cell = {
    periodYear: number;
    periodQuarter: number | null;
    periodMonth: number | null;
    portco: KpiScalar | null;
    investor: KpiScalar | null;
    portcoUpdatedAt: string | null;
    investorUpdatedAt: string | null;
  };
  const byKpi = new Map<number, Map<string, Cell>>();
  for (const val of vals ?? []) {
    // The portal saves portco values onto their submission while the portco is
    // still filling it in; like getCompanyReporting, investors see them only
    // once it is submitted.
    if (
      val.origin !== 'investor' &&
      unwrap(val.inv_reporting_submission)?.status !== 'submitted'
    ) {
      continue;
    }
    const cells = byKpi.get(val.kpi_id) ?? new Map<string, Cell>();
    const key = `${val.period_year}|${val.period_month != null ? `M${val.period_month}` : (val.period_quarter ?? 'FY')}`;
    const cell = cells.get(key) ?? {
      periodYear: val.period_year,
      periodQuarter: val.period_quarter,
      periodMonth: val.period_month,
      portco: null,
      investor: null,
      portcoUpdatedAt: null,
      investorUpdatedAt: null,
    };
    const scalar: KpiScalar = {
      numeric: val.value_numeric,
      text: val.value_text,
    };
    if (val.origin === 'investor') {
      cell.investor = scalar;
      cell.investorUpdatedAt = val.updated_at;
    } else {
      cell.portco = scalar;
      cell.portcoUpdatedAt = val.updated_at;
    }
    cells.set(key, cell);
    byKpi.set(val.kpi_id, cells);
  }

  return list.map((d) => ({
    publicId: d.public_id,
    label: d.label,
    category: d.category,
    valueType: d.value_type as CustomKpiValueType,
    isFlow: d.is_flow,
    values: Array.from(byKpi.get(d.id)?.values() ?? []).map((c) => ({
      periodYear: c.periodYear,
      periodQuarter: c.periodQuarter,
      periodMonth: c.periodMonth,
      portcoValue: c.portco,
      investorValue: c.investor,
      displayValue: c.investor ?? c.portco ?? { numeric: null, text: null },
      edited: c.investor != null,
      portcoUpdatedAt: c.portcoUpdatedAt,
      investorUpdatedAt: c.investorUpdatedAt,
    })),
  }));
}

// Investor-authored values for this company's standard (coded) KPIs. Portco
// submissions come through getCompanyReporting; these are the investor-origin
// rows only (never drafts — only investors write origin='investor'), so the
// table can merge them in with investor precedence and mark edited cells.
// Document extraction writes with the same origin, which is how monthly values
// reach the tables — the portal itself only authors quarterly and FY cells.
export async function getCompanyStandardKpiOverrides(
  companyId: number,
): Promise<StandardKpiOverride[]> {
  const scope = await createOrgReadClient();
  if (!scope) return [];

  const { data, error } = await scope.supabase
    .from('inv_kpi_value')
    .select(
      'period_year, period_quarter, period_month, value_numeric, value_text, updated_at, inv_kpi ( public_id, code, is_active )',
    )
    .eq('company_id', companyId)
    .eq('organization_id', scope.organizationId)
    .eq('origin', 'investor');

  if (error) {
    logger.error(
      { error, companyId },
      'Failed to fetch standard KPI overrides',
    );
    return [];
  }

  const hidden = new Set(await getHiddenKpiIds());
  const overrides: StandardKpiOverride[] = [];
  for (const row of data ?? []) {
    const kpi = unwrap(row.inv_kpi);
    // Standard KPIs are coded; custom-KPI investor values (code NULL) surface in
    // the custom payload instead.
    if (!kpi?.code || !kpi.is_active) continue;
    if (hidden.has(kpi.public_id)) continue;
    overrides.push({
      code: kpi.code,
      periodYear: row.period_year,
      periodQuarter: row.period_quarter,
      periodMonth: row.period_month,
      value: { numeric: row.value_numeric, text: row.value_text },
      updatedAt: row.updated_at,
    });
  }
  return overrides;
}
