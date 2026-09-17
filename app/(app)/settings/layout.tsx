import { SettingsLayout } from '@/components/settings/SettingsLayout';

export default async function CpmSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SettingsLayout module="cpm">{children}</SettingsLayout>;
}
