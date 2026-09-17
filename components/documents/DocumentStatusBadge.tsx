import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type DocumentStatusCategory =
  | 'processing'
  | 'complete'
  | 'failed'
  | 'invalid'
  | 'uploaded';

const STATUS_CATEGORY_COLORS: Record<DocumentStatusCategory, string> = {
  processing: '#2986B1',
  complete: '#636D2A',
  failed: '#AD532F',
  invalid: '#CB5724',
  uploaded: '#6B7280',
};

function getStatusStyles(
  category: DocumentStatusCategory,
): React.CSSProperties {
  const color = STATUS_CATEGORY_COLORS[category];
  return {
    backgroundColor: color,
    borderColor: color,
    color: '#ffffff',
  };
}

interface DocumentStatusBadgeProps {
  label: string;
  category: DocumentStatusCategory;
  failureMessage?: string;
}

export function DocumentStatusBadge({
  label,
  category,
  failureMessage,
}: DocumentStatusBadgeProps) {
  const style = getStatusStyles(category);

  const variant = category === 'failed' ? 'destructive' : 'outline';
  const badgeStyle = category === 'failed' ? undefined : style;

  if (category === 'failed' && failureMessage) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex cursor-help items-center">
              <Badge variant={variant} className="text-xs" style={badgeStyle}>
                {label}
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="max-w-sm space-y-1.5 border-l-2"
          >
            <p className="font-semibold">Processing Failed</p>
            <p className="text-sm text-white/80">{failureMessage}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Badge variant={variant} className="text-xs" style={badgeStyle}>
      {label}
    </Badge>
  );
}
