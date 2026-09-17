import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const highlightClassName =
  'border-blue-500/40 bg-blue-500/10 ring-1 ring-blue-500/30';

export function StatCard({
  label,
  value,
  valueClassName,
  active,
  onClick,
  size = 'default',
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
  active?: boolean;
  onClick?: () => void;
  size?: 'default' | 'sm';
}) {
  return (
    <Card
      className={cn(onClick && 'cursor-pointer', active && highlightClassName)}
      onClick={onClick}
    >
      <CardContent
        className={
          size === 'sm' ? 'flex items-center justify-between py-3' : 'pt-6'
        }
      >
        <p className="text-sm text-muted-foreground">{label}</p>
        <p
          className={`font-extralight whitespace-nowrap font-serif ${size === 'sm' ? 'text-lg' : 'text-2xl'} ${valueClassName ?? ''}`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
