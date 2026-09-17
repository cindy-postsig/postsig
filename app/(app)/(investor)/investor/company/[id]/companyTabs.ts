export const companyTabItems = [
  { key: 'overview', label: 'Overview' },
  { key: 'co-investors', label: 'Co-Investors' },
  { key: 'cap-table', label: 'Capitalization' },
  { key: 'liq-pref', label: 'Liq Pref' },
  { key: 'legal', label: 'Legal Terms' },
  { key: 'documents', label: 'Documents' },
  { key: 'kpis', label: 'KPIs' },
  { key: 'audit-logs', label: 'Audit Log' },
] as const;

export type CompanyTabKey = (typeof companyTabItems)[number]['key'];

export const DEFAULT_COMPANY_TAB: CompanyTabKey = 'overview';

export function getVisibleCompanyTabItems(
  portcoKpisEnabled: boolean,
): ReadonlyArray<(typeof companyTabItems)[number]> {
  if (portcoKpisEnabled) return companyTabItems;
  return companyTabItems.filter((tab) => tab.key !== 'kpis');
}
