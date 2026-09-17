import { notFound } from 'next/navigation';
import { hasExchangeAgreementAccess } from '@/lib/exchange-agreement/access';

// `page.tsx` (the /exchange-agreements root) and `(views)/layout.tsx` are
// route-siblings, not nested — gating here covers both from one place
// instead of repeating the check in each.
export default async function ExchangeAgreementsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await hasExchangeAgreementAccess())) notFound();

  return children;
}
