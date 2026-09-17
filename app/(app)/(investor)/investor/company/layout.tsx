import { getInvPortfolioCompanies, getInvPortfolioFunds } from '@/lib/v2/inv';
import { getUserMetadata } from '@/data/users';
import { CompanyShell, type PanelCompany } from './[id]/CompanyShell';

export default async function CompanyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [{ companies }, { funds: portfolioFunds }, userMetadata] =
    await Promise.all([
      getInvPortfolioCompanies(),
      getInvPortfolioFunds(),
      getUserMetadata(),
    ]);

  const panelCompanies: PanelCompany[] = companies
    .map((c) => ({
      id: c.id,
      name: c.name,
      domain: c.domain,
      funds: (c.funds ?? []).map((f) => ({ id: f.id, name: f.name })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const funds = portfolioFunds.map((f) => ({ id: f.id, name: f.name }));

  return (
    <CompanyShell
      companies={panelCompanies}
      funds={funds}
      portcoKpisEnabled={userMetadata?.portcoKpisEnabled ?? false}
    >
      {children}
    </CompanyShell>
  );
}
