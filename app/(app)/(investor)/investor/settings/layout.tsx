import { SettingsLayout } from '@/components/settings/SettingsLayout';

export default async function InvestorSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SettingsLayout module="investor">{children}</SettingsLayout>;
}
