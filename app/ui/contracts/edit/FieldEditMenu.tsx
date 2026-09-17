'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { DotsHorizontalIcon, Pencil2Icon } from '@radix-ui/react-icons';

interface FieldEditMenuProps {
  onEdit: () => void;
  disabled?: boolean;
}

export function FieldEditMenu({ onEdit, disabled }: FieldEditMenuProps) {
  const handleTriggerClick = (e: React.MouseEvent) => {
    // Stop propagation to prevent CitationField from handling the click
    e.stopPropagation();
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 opacity-0 transition-opacity group-hover/field:opacity-100 data-[state=open]:opacity-100"
          disabled={disabled}
          onClick={handleTriggerClick}
        >
          <DotsHorizontalIcon className="h-4 w-4" />
          <span className="sr-only">Field options</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={handleEditClick} disabled={disabled}>
          <Pencil2Icon className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
