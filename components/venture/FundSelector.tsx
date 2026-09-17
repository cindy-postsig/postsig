'use client';

import React from 'react';
import { ChevronDownIcon } from '@radix-ui/react-icons';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useMode, type FundId } from '@/contexts/ModeContext';

export default function FundSelector({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const {
    selectedFunds,
    setSelectedFunds,
    funds,
    isLoadingFunds,
    selectedFundsLabel,
  } = useMode();

  const isAllSelected = selectedFunds.includes('all');

  const handleFundToggle = (fundId: FundId, checked: boolean) => {
    if (fundId === 'all') {
      // "All Funds" is a reset; narrow by selecting individual funds instead
      if (checked) {
        setSelectedFunds(['all']);
      }
      return;
    }

    let newSelection = checked
      ? [...selectedFunds.filter((id) => id !== 'all'), fundId]
      : selectedFunds.filter((id) => id !== fundId && id !== 'all');

    if (newSelection.length === 0) {
      newSelection = ['all'];
    }

    const individualFunds = funds.filter((f) => f.id !== 'all');
    const allIndividualSelected = individualFunds.every((f) =>
      newSelection.includes(f.id),
    );
    if (allIndividualSelected && individualFunds.length > 0) {
      newSelection = ['all'];
    }

    setSelectedFunds(newSelection);
  };

  const isFundSelected = (fundId: FundId): boolean => {
    if (fundId === 'all') {
      return isAllSelected;
    }
    return !isAllSelected && selectedFunds.includes(fundId);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-8 gap-1"
          disabled={isLoadingFunds || disabled}
        >
          <span className="font-medium text-sm">{selectedFundsLabel}</span>
          <ChevronDownIcon className="h-4 w-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto">
        {funds.map((fund, index) => (
          <React.Fragment key={fund.id === 'all' ? 'all' : fund.id}>
            <DropdownMenuCheckboxItem
              checked={isFundSelected(fund.id)}
              onCheckedChange={(checked) => handleFundToggle(fund.id, checked)}
              onSelect={(e) => e.preventDefault()}
            >
              {fund.name}
            </DropdownMenuCheckboxItem>
            {fund.id === 'all' && funds.length > 1 && <DropdownMenuSeparator />}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
