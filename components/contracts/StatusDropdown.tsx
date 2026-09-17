'use client';
import React, { useState, useEffect, useRef } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { ChevronDownIcon } from '@radix-ui/react-icons';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAbility } from '@/components/providers/AbilityProvider';

interface StatusDropdownProps {
  currentStatus: 'unconfirmed' | 'active' | 'inactive';
  onStatusUpdate: (newStatus: 'active' | 'inactive') => Promise<boolean>;
  isLoading: boolean;
  isDuplicate?: boolean;
}

const StatusDropdown: React.FC<StatusDropdownProps> = ({
  currentStatus,
  onStatusUpdate,
  isLoading,
  isDuplicate = false,
}) => {
  const ability = useAbility();
  const canUpdate = ability.can('update', 'Contract');

  const [displayStatus, setDisplayStatus] = useState<
    'unconfirmed' | 'active' | 'inactive'
  >(currentStatus);
  const [isUpdating, setIsUpdating] = useState(false);
  const lastSuccessfulUpdateRef = useRef<'unconfirmed' | 'active' | 'inactive'>(
    currentStatus,
  );

  useEffect(() => {
    lastSuccessfulUpdateRef.current = currentStatus;
    setDisplayStatus(currentStatus);
  }, [currentStatus]);

  const handleStatusUpdate = async (newStatus: string) => {
    if (
      newStatus === displayStatus ||
      (newStatus !== 'active' && newStatus !== 'inactive')
    )
      return;
    setIsUpdating(true);
    setDisplayStatus(newStatus as 'active' | 'inactive');
    try {
      const success = await onStatusUpdate(newStatus as 'active' | 'inactive');
      if (!success) {
        setDisplayStatus(lastSuccessfulUpdateRef.current);
      }
    } catch (error) {
      console.error('Status update failed:', error);
      setDisplayStatus(lastSuccessfulUpdateRef.current);
    } finally {
      setIsUpdating(false);
    }
  };

  if (isDuplicate) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <div className="flex h-6 items-center justify-center rounded-full border border-pink-300 px-2 text-xs capitalize text-pink-600">
              {displayStatus}
            </div>
          </TooltipTrigger>
          <TooltipContent className="w-64">
            <p>
              A new version of this contract has been uploaded, and this version
              cannot be moved to active status anymore.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const isDisabled = isLoading || isUpdating || !canUpdate;

  const buttonContent = (
    <Button
      className="h-6 gap-1 rounded-full border border-destructive bg-destructive/5 py-0 pl-1 pr-2 text-xs capitalize text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-destructive/5"
      disabled={isDisabled}
    >
      <span className="flex gap-2 px-2 pr-0">
        {displayStatus}
        {(isLoading || isUpdating) && (
          <Loader2 className="h-3 w-3 animate-spin" />
        )}
      </span>
      <ChevronDownIcon className="h-3 w-3" />
    </Button>
  );

  if (isDisabled) {
    return buttonContent;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{buttonContent}</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Update Status</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={displayStatus}
          onValueChange={handleStatusUpdate}
        >
          <DropdownMenuRadioItem value="active">Active</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="inactive">
            Inactive
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default StatusDropdown;
