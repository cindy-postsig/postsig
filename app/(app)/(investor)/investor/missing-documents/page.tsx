import { redirect } from 'next/navigation';
import { getInvMissingDocuments } from '@/lib/v2/inv';
import { getUserMetadata } from '@/data/users';
import { MissingDocumentsReport } from './MissingDocumentsReport';

export default async function MissingDocumentsPage() {
  const [result, userMetadata] = await Promise.all([
    getInvMissingDocuments(),
    getUserMetadata(),
  ]);

  if (userMetadata?.investorTrialEnabled) {
    return redirect('/investor/documents');
  }

  return <MissingDocumentsReport data={result} />;
}
