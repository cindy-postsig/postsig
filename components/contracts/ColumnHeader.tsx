import { Button } from '@/components/ui/button';
import { Column } from '@tanstack/react-table';
import { ArrowUp, ArrowDown } from 'lucide-react';

type ColumnHeaderProps<TData, TValue> = {
  column: Column<TData, TValue>;
  title: string;
  align?: string;
};

export function ColumnHeader<TData, TValue>({
  column,
  title,
  align = 'left',
}: ColumnHeaderProps<TData, TValue>) {
  const isSorted = column.getIsSorted();
  return (
    <Button
      variant="link"
      onClick={() => column.toggleSorting(isSorted === 'asc')}
      className={`${
        isSorted
          ? 'font-medium text-foreground'
          : 'font-normal text-muted-foreground'
      } h-auto gap-1 whitespace-nowrap p-0 text-[0.75rem] hover:bg-transparent 3xl:text-[0.8rem] ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      {title}
      {isSorted === 'asc' ? (
        <ArrowUp className="h-4 w-4" />
      ) : isSorted === 'desc' ? (
        <ArrowDown className="h-4 w-4" />
      ) : (
        ''
      )}
    </Button>
  );
}
