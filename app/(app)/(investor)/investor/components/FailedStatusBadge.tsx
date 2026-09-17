import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { VentureDocumentFailureInfo } from '../types';

interface FailedStatusBadgeProps {
  failureInfo?: VentureDocumentFailureInfo;
  style?: React.CSSProperties;
}

export function FailedStatusBadge({
  failureInfo,
  style,
}: FailedStatusBadgeProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex cursor-help items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-[#AD532F]" />
            <Badge variant="outline" className="text-xs" style={style}>
              FAILED
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-sm space-y-1.5 border-l-2">
          <p className="font-semibold">Processing Failed</p>
          <p className="text-sm text-white/80">
            {failureInfo?.message ?? 'An unexpected error occurred'}
          </p>
          {failureInfo?.stage && (
            <p className="text-xs text-white/50">Stage: {failureInfo.stage}</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
