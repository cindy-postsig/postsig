import { getInvPortfolioCompanies } from '@/lib/v2/inv';
import { getUserMetadata } from '@/data/users';
import { PortfolioEmptyState } from './PortfolioEmptyState';
import { VentureTableClient } from '../VentureTableClient';
import { redirect } from 'next/navigation';
import { isPortfolioHidden } from '@/lib/navigation/portfolioVisibility';

export default async function PortfolioPage() {
  const userMetadata = await getUserMetadata();

  if (
    await isPortfolioHidden(userMetadata?.userId, userMetadata?.organizationId)
  ) {
    return redirect('/investor/documents');
  }

  const isInvestorTrial = userMetadata?.investorTrialEnabled ?? false;

  if (isInvestorTrial) {
    return redirect('/investor/documents');
  }

  const { companies } = await getInvPortfolioCompanies();

  if (companies.length === 0) {
    return <PortfolioEmptyState />;
  }

  return (
    <div>
      <h1 className="font-normal mb-6">Portfolio</h1>
      <VentureTableClient
        initialData={companies}
        isInvestorTrial={isInvestorTrial}
      />
    </div>
  );
}
