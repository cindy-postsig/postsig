import {
  companyTabItems,
  getVisibleCompanyTabItems,
  DEFAULT_COMPANY_TAB,
} from '@/app/(app)/(investor)/investor/company/[id]/companyTabs';

describe('getVisibleCompanyTabItems', () => {
  it('includes the KPIs tab when the portco module is enabled', () => {
    const keys = getVisibleCompanyTabItems(true).map((tab) => tab.key);
    expect(keys).toContain('kpis');
    expect(keys).toEqual(companyTabItems.map((tab) => tab.key));
  });

  it('hides the KPIs tab when the portco module is disabled', () => {
    const keys = getVisibleCompanyTabItems(false).map((tab) => tab.key);
    expect(keys).not.toContain('kpis');
  });

  it('leaves every non-KPI tab untouched when disabled', () => {
    const keys = getVisibleCompanyTabItems(false).map((tab) => tab.key);
    expect(keys).toEqual(
      companyTabItems.map((tab) => tab.key).filter((key) => key !== 'kpis'),
    );
  });

  it('keeps the default tab reachable when disabled', () => {
    const keys = getVisibleCompanyTabItems(false).map((tab) => tab.key);
    expect(keys).toContain(DEFAULT_COMPANY_TAB);
  });
});
