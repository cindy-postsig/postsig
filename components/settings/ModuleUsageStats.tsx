'use client';

import { useEffect, useState } from 'react';
import { UsageStat } from './UsageStat';
import { getModuleStats, type StatItem } from '@/app/lib/actions/module-stats';
import type { AppModule } from '@/lib/settings/config';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

interface ModuleUsageStatsProps {
  module: AppModule;
  userCount: number;
  userLimit: number;
}

function StatSkeleton() {
  return (
    <Card className="p-4">
      <div className="flex flex-col space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-16" />
      </div>
    </Card>
  );
}

export function ModuleUsageStats({
  module,
  userCount,
  userLimit,
}: ModuleUsageStatsProps) {
  const [stats, setStats] = useState<StatItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getModuleStats(module)
      .then(setStats)
      .finally(() => setLoading(false));
  }, [module]);

  const isOverLimit = userCount >= userLimit;

  return (
    <div className="grid grid-cols-3 gap-4">
      {loading ? (
        <>
          <StatSkeleton />
          <StatSkeleton />
        </>
      ) : (
        stats.map((stat) => (
          <UsageStat
            key={stat.key}
            label={stat.label}
            value={stat.value}
            tooltip={stat.tooltip}
          />
        ))
      )}
      <UsageStat
        label="Total PostSig users"
        value={userCount}
        badge={
          isOverLimit
            ? { label: 'Over Limit', variant: 'notice', size: 'sm' }
            : undefined
        }
        suffix={<span className="text-sm">/{userLimit}</span>}
        valueClassName={isOverLimit ? 'text-amber-700' : ''}
      />
    </div>
  );
}
