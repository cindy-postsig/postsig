'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Download } from 'lucide-react';
import {
  formatParticipationCap,
  handleDownload,
  formatPricePerShare,
} from '@/app/lib/utils';
import { exportLiqPrefCSV } from '@/app/lib/actions/investor/export';
import { useCanExportCsv } from '@/hooks/useCanExportCsv';
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { LiqPrefData } from '../../types';
import { TableShell } from '@/app/(app)/(investor)/investor/components/TableShell';
import {
  formatFullUSD,
  formatNumber,
  getParticipationLabel,
} from './companyDetailsFormat';
import {
  Section,
  TabHeader,
  BareMetric,
  MetricRow,
  TabEmptyState,
} from './companyDetailsPrimitives';

export function LiqPrefContent({
  liqPrefData,
  companyName,
}: {
  liqPrefData?: LiqPrefData;
  companyName: string;
}) {
  const [isExporting, setIsExporting] = useState(false);
  const canExport = useCanExportCsv('investor');
  const { toast } = useToast();

  const handleExportCSV = async () => {
    if (!liqPrefData || liqPrefData.rows.length === 0) return;
    setIsExporting(true);
    try {
      const csvContent = await exportLiqPrefCSV(liqPrefData, companyName);
      const blob = new Blob([csvContent], {
        type: 'text/csv;charset=utf-8;',
      });
      await handleDownload(
        blob,
        `${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_Capital_Stack.csv`,
      );
    } catch {
      toast({
        variant: 'destructive',
        title: 'Export failed',
        description: 'Unable to export the capital stack CSV.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (!liqPrefData || liqPrefData.rows.length === 0) {
    return (
      <TabEmptyState title="Liquidation Preference">
        No liquidation preference data available.
      </TabEmptyState>
    );
  }

  return (
    <div className="space-y-12 pb-12">
      <TabHeader
        title="Liquidation Preference"
        action={
          canExport ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={isExporting}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          ) : null
        }
      />
      <MetricRow columns={2}>
        <BareMetric
          title="My Total Liq Pref"
          value={formatFullUSD(liqPrefData.myTotalLiqPref)}
          tooltip={{
            title: 'My Total Liquidation Preference',
            description:
              'Sum of liquidation preferences across all equity classes based on your shares, price per unit, and the liquidation multiplier.',
          }}
        />
        <BareMetric
          title="Total Liq Pref"
          value={formatFullUSD(liqPrefData.totalLiqPref)}
          tooltip={{
            title: 'Total Liquidation Preference',
            description:
              'Sum of liquidation preferences across all equity classes based on total outstanding shares, price per unit, and the liquidation multiplier.',
          }}
        />
      </MetricRow>
      <Section title="Capital Stack">
        <TableShell>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[120px]">Equity Class</TableHead>
              <TableHead className="text-center">Preference</TableHead>
              <TableHead className="text-right">Price/Unit</TableHead>
              <TableHead className="text-right">Multiplier</TableHead>
              <TableHead className="text-center">Participation</TableHead>
              <TableHead className="text-center">Cap</TableHead>
              <TableHead className="text-right">My Shares</TableHead>
              <TableHead className="text-right">My Cost</TableHead>
              <TableHead className="text-right">My Liq Pref</TableHead>
              <TableHead className="text-right">Total Liq Pref</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {liqPrefData.rows.map((row) => (
              <TableRow key={row.securityId}>
                <TableCell className="font-medium">{row.equityClass}</TableCell>
                <TableCell className="text-center">
                  {row.preference != null ? (
                    <Badge variant="outline">{row.preference}</Badge>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.pricePerUnit != null
                    ? formatPricePerShare(row.pricePerUnit)
                    : '-'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.multiplier != null ? `${row.multiplier}x` : '-'}
                </TableCell>
                <TableCell className="text-center">
                  {row.participationType
                    ? getParticipationLabel(row.participationType)
                    : '-'}
                </TableCell>
                <TableCell className="text-center">
                  {row.participationCap != null
                    ? formatParticipationCap(row.participationCap)
                    : '-'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(row.myShares)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.myCost > 0 ? formatFullUSD(row.myCost) : '-'}
                </TableCell>
                <TableCell className="text-right tabular-nums text-primary">
                  {row.myLiqPref > 0 ? formatFullUSD(row.myLiqPref) : '-'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.totalLiqPref != null
                    ? formatFullUSD(row.totalLiqPref)
                    : '-'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </TableShell>
      </Section>
    </div>
  );
}
