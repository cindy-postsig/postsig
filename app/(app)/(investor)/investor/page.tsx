import {
  getInvPortfolioCompanies,
  getInvInvestmentFlows,
  getInvCashFlows,
  getInvMissingDocuments,
} from '@/lib/v2/inv';
import { getUserMetadata } from '@/data/users';
import { redirect } from 'next/navigation';
import { isPortfolioHidden } from '@/lib/navigation/portfolioVisibility';
import { WelcomePage } from './WelcomePage';
import { InvestorDashboard } from './InvestorDashboard';

export default async function InvestorOverviewPage() {
  const userMetadata = await getUserMetadata();

  const isInvestorTrial = userMetadata?.investorTrialEnabled ?? false;

  if (isInvestorTrial) {
    return redirect('/investor/documents');
  }

  if (
    await isPortfolioHidden(userMetadata?.userId, userMetadata?.organizationId)
  ) {
    return redirect('/investor/documents');
  }

  const [{ companies }, { flows }, { cashFlows }, missingDocsResult] =
    await Promise.all([
      getInvPortfolioCompanies(),
      getInvInvestmentFlows(),
      getInvCashFlows(),
      getInvMissingDocuments(),
    ]);

  const userName = userMetadata?.userProfile?.name;

  if (companies.length === 0) {
    return <WelcomePage userName={userName ?? undefined} />;
  }

  return (
    <div>
      <h1 className="font-normal mb-12">
        {userMetadata?.organizationName ?? 'Dashboard'}
      </h1>
      <InvestorDashboard
        companies={companies}
        flows={flows}
        cashFlows={cashFlows}
        missingDocsCount={missingDocsResult.companiesWithMissing}
      />
    </div>
  );
}
