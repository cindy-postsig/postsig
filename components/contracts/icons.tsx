import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { UpdateIcon } from '@radix-ui/react-icons';

interface RenewedIconProps {
  dateType?: string;
  originalDate?: string | null;
  height?: number;
  width?: number;
}

export const RenewedIcon = ({
  dateType,
  originalDate,
  height = 14,
  width = 14,
}: RenewedIconProps) => {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>
          <UpdateIcon width={width} height={height} />
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-col gap-0">
            <strong>Renewed</strong>
            <div className="text-xs capitalize">
              Original {dateType} Date: {originalDate || 'N/A'}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
