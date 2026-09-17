import { Badge } from '@/components/ui/badge';
import {
  STAGE_COLORS,
  CASH_POSITION_COLORS,
  SECURITY_COLORS,
  getStageColor,
} from '../colors';
import type { InvestmentStage } from '../types';

interface Swatch {
  label: string;
  hex: string;
}

function findDuplicates(entries: Swatch[]): Set<string> {
  const seen = new Map<string, number>();
  for (const { hex } of entries) {
    const key = hex.toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return new Set(
    [...seen.entries()].filter(([, count]) => count > 1).map(([hex]) => hex),
  );
}

function Section({ title, entries }: { title: string; entries: Swatch[] }) {
  const duplicates = findDuplicates(entries);

  return (
    <section className="space-y-4">
      <h2 className="font-semibold text-lg tracking-tight">{title}</h2>
      <div className="flex flex-wrap gap-4">
        {entries.map(({ label, hex }) => {
          const isDuplicate = duplicates.has(hex.toLowerCase());
          return (
            <div key={label} className="flex w-24 flex-col gap-1.5">
              <div className="relative">
                <span
                  className="block h-20 w-24 rounded-md border border-border/50"
                  style={{ backgroundColor: hex }}
                />
                {isDuplicate && (
                  <span className="font-medium absolute right-1 top-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                    dup
                  </span>
                )}
              </div>
              <div className="font-medium truncate text-xs text-foreground">
                {label}
              </div>
              <div className="font-mono text-[10px] uppercase text-muted-foreground">
                {hex}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StageBadges() {
  const stages = Object.keys(STAGE_COLORS) as InvestmentStage[];

  return (
    <section className="space-y-4">
      <h2 className="font-semibold text-lg tracking-tight">Stage badges</h2>
      <p className="text-sm text-muted-foreground">
        Solid is the portfolio table; tinted is the company-details transaction
        list.
      </p>
      <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-6 gap-y-3">
        <div className="font-medium text-xs uppercase text-muted-foreground">
          Stage
        </div>
        <div className="font-medium text-xs uppercase text-muted-foreground">
          Solid
        </div>
        <div className="font-medium text-xs uppercase text-muted-foreground">
          Tinted
        </div>
        {stages.map((stage) => {
          const color = getStageColor(stage);
          return (
            <div key={stage} className="contents">
              <span className="text-sm text-foreground">{stage}</span>
              <span>
                <Badge
                  variant="outline"
                  className="whitespace-nowrap text-xs"
                  style={{
                    backgroundColor: color,
                    borderColor: color,
                    color: '#ffffff',
                  }}
                >
                  {stage}
                </Badge>
              </span>
              <span>
                <Badge
                  variant="secondary"
                  className="text-xs"
                  style={{ backgroundColor: `${color}20`, color }}
                >
                  {stage}
                </Badge>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function ColorsReviewPage() {
  const stageEntries = Object.entries(STAGE_COLORS).map(([label, hex]) => ({
    label,
    hex,
  }));
  const cashEntries = Object.entries(CASH_POSITION_COLORS).map(
    ([label, hex]) => ({ label, hex }),
  );
  const securityEntries = Object.entries(SECURITY_COLORS).map(
    ([label, hex]) => ({ label, hex }),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-12 p-8">
      <header className="space-y-1">
        <h1 className="font-semibold text-2xl tracking-tight">
          Investor stage colors
        </h1>
        <p className="text-sm text-muted-foreground">
          Swatches pulled live from <code>investor/colors.ts</code>. Anything
          tagged <span className="font-medium text-destructive">dup</span>{' '}
          shares its hex with another entry in the same group.
        </p>
      </header>

      <Section title="Investment stages" entries={stageEntries} />
      <StageBadges />
      <Section title="Cash position" entries={cashEntries} />
      <Section title="Securities" entries={securityEntries} />
    </div>
  );
}
