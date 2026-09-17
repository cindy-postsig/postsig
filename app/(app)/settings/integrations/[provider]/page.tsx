import IntegrationDetailPageClient from '@/components/settings/IntegrationDetailPageClient';

export default async function IntegrationDetailPage({
  params,
}: {
  params: Promise<{ provider: string }>;
}) {
  const { provider } = await params;
  return <IntegrationDetailPageClient provider={provider} />;
}
