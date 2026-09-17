import { getVentureDocuments, getModuleArchives } from '@/lib/v2';
import { getUserMetadata } from '@/data/users';
import { isPortfolioHidden } from '@/lib/navigation/portfolioVisibility';
import { DocumentsTableClient } from './DocumentsTableClient';

export default async function VentureDocumentsPage() {
  const [{ documents }, { archives }, userMetadata] = await Promise.all([
    getVentureDocuments(),
    getModuleArchives('investor'),
    getUserMetadata(),
  ]);

  const isInvestorTrial = userMetadata?.investorTrialEnabled ?? false;
  const hidePortfolio = await isPortfolioHidden(
    userMetadata?.userId,
    userMetadata?.organizationId,
  );

  return (
    <DocumentsTableClient
      initialData={documents}
      initialArchives={archives}
      organizationId={userMetadata?.organizationId}
      isInvestorTrial={isInvestorTrial}
      hidePortfolio={hidePortfolio}
    />
  );
}
