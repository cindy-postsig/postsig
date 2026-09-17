'use client';

import { useState } from 'react';
import VendorIcon from '@/components/vendors/VendorIcon';
import { Badge } from '@/components/ui/badge';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DotsHorizontalIcon } from '@radix-ui/react-icons';
import { handleDownload } from '@/app/lib/utils';
import {
  exportCompanyExcel,
  exportCompanyCSV,
} from '@/app/lib/actions/investor/export';
import { useCanExportCsv } from '@/hooks/useCanExportCsv';
import type { InvestmentStage, PortfolioCompany } from '../../types';
import type { InvCorporateEventSummary } from '@/lib/v2/inv/types';
import { CorporateEventBanner } from './CorporateEventBanner';
import { getStageColor } from '../../colors';
import { RoundSelector } from './RoundSelector';
import { useRoundFilter } from './RoundFilterContext';
import {
  EntityTagsProvider,
  EntityTagsList,
  AddTagsButton,
} from '@/app/(app)/(investor)/investor/components/EntityTags';

interface CompanyHeaderProps {
  company: PortfolioCompany;
  corporateEvents?: InvCorporateEventSummary[];
}

function getStageStyles(stage: InvestmentStage): React.CSSProperties {
  const baseColor = getStageColor(stage);
  return {
    backgroundColor: baseColor,
    borderColor: baseColor,
    color: '#ffffff',
  };
}

const EXITED_STAGES = new Set([
  'dissolved',
  'acquired',
  'merged',
  'winding down',
]);

function isExitedStage(stage: string): boolean {
  return EXITED_STAGES.has(stage.trim().toLowerCase());
}

export function CompanyHeader({
  company,
  corporateEvents,
}: CompanyHeaderProps) {
  const [isExporting, setIsExporting] = useState(false);
  const canExport = useCanExportCsv('investor');
  const { rounds } = useRoundFilter();
  const hasSingleRound = rounds.length <= 1;

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const result = await exportCompanyExcel(company);
      const blob = new Blob([new Uint8Array(result)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      await handleDownload(
        blob,
        `${company.name.replace(/[^a-zA-Z0-9]/g, '_')}_Export.xlsx`,
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const csvContent = await exportCompanyCSV(company);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      await handleDownload(
        blob,
        `${company.name.replace(/[^a-zA-Z0-9]/g, '_')}_Export.csv`,
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <EntityTagsProvider
      entityId={company.entityId}
      initialTags={company.tags.map((t) => t.name)}
    >
      <div className="mx-auto flex items-start justify-between px-12">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-6">
            <VendorIcon
              name={company.name}
              domain={company.domain}
              width={60}
              height={60}
            />
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <h1 className="font-normal text-3xl leading-none">
                  {company.name}
                </h1>
                {hasSingleRound && company.stage && (
                  <Badge
                    variant="outline"
                    style={getStageStyles(company.stage)}
                  >
                    {company.stage}
                  </Badge>
                )}
                {!hasSingleRound &&
                  company.stage &&
                  isExitedStage(company.stage) && (
                    <Badge
                      variant="outline"
                      style={getStageStyles(company.stage)}
                    >
                      {company.stage}
                    </Badge>
                  )}
              </div>
              <CorporateEventBanner events={corporateEvents} />
              {(company.funds?.length ?? 0) > 1 ? (
                <HoverCard openDelay={100}>
                  <HoverCardTrigger asChild>
                    <p className="w-fit cursor-default text-sm text-foreground/70">
                      {company.funds!.length} Funds
                    </p>
                  </HoverCardTrigger>
                  <HoverCardContent align="start" className="w-fit min-w-40">
                    <div className="flex flex-col gap-1">
                      {company.funds!.map((f) => (
                        <p key={f.id} className="text-sm">
                          {f.name}
                        </p>
                      ))}
                    </div>
                  </HoverCardContent>
                </HoverCard>
              ) : (company.funds?.length ?? 0) === 1 ? (
                <p className="text-sm text-foreground/70">
                  {company.funds![0].name}
                </p>
              ) : company.fund ? (
                <p className="text-sm text-foreground/70">{company.fund}</p>
              ) : null}
            </div>
          </div>
          <EntityTagsList className="max-w-xl pl-[84px]" size="sm" />
        </div>
        <div className="flex items-center gap-2">
          <AddTagsButton />
          <RoundSelector />
          {canExport && (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-sm outline-none hover:bg-gray-700/10">
                <DotsHorizontalIcon width={20} height={20} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {/* <DropdownMenuItem
            onClick={() => {
              // TODO: Implement upload documents
            }}
          >
            Upload Documents
          </DropdownMenuItem> */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger disabled={isExporting}>
                    Export
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem
                      onClick={handleExportCSV}
                      disabled={isExporting}
                    >
                      CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleExportExcel}
                      disabled={isExporting}
                    >
                      Excel
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </EntityTagsProvider>
  );
}
