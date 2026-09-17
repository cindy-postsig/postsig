import { cn } from '@/lib/utils';

interface SettingsPageProps {
  wide?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function SettingsPage({ wide, className, children }: SettingsPageProps) {
  return (
    <div
      className={cn(
        'p-10 pb-24 pl-4',
        wide ? '2xl:w-full' : '2xl:w-3/4',
        className,
      )}
    >
      {children}
    </div>
  );
}
