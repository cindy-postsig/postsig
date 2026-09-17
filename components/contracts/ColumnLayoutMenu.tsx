'use client';

import * as React from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from '@dnd-kit/modifiers';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { GripVertical, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useColumnLayout } from '@/contexts/ColumnLayoutContext';
import {
  isDefaultLayout,
  layoutFromEntries,
  reorderColumns,
  resolveLayoutEntries,
  type ColumnLayoutViewKey,
  type ColumnSpec,
  type LayoutEntry,
} from './columnLayout';

type ColumnLayoutMenuProps = {
  viewKey: ColumnLayoutViewKey;
  /** The view's default column specs, before any stored layout is applied. */
  defaults: readonly ColumnSpec[];
};

/**
 * Column picker for a configurable list view: drag to reorder, uncheck to
 * remove, Reset to revert.
 *
 * Ordering logic lives in `columnLayout.ts` as pure functions, so this
 * component only handles presentation and the drag sensors.
 */
export function ColumnLayoutMenu({ viewKey, defaults }: ColumnLayoutMenuProps) {
  const { layout, setLayout, reset } = useColumnLayout(viewKey);

  const entries = React.useMemo(
    () => resolveLayoutEntries(defaults, layout, viewKey),
    [defaults, layout, viewKey],
  );

  const isCustomised = !isDefaultLayout(defaults, layout, viewKey);

  const commit = React.useCallback(
    (next: LayoutEntry[]) => {
      const nextLayout = layoutFromEntries(next);
      // Landing back on the defaults clears the stored layout rather than
      // saving one that happens to match.
      if (isDefaultLayout(defaults, nextLayout, viewKey)) reset();
      else setLayout(nextLayout);
    },
    [defaults, reset, setLayout, viewKey],
  );

  const sensors = useSensors(
    // A small activation distance keeps the checkbox clickable — without it a
    // click on the row registers as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    commit(reorderColumns(entries, String(active.id), String(over.id)));
  };

  const toggle = (id: string) =>
    commit(
      entries.map((entry) =>
        entry.id === id ? { ...entry, visible: !entry.visible } : entry,
      ),
    );

  // Pinned entries always lead, so they render above the sortable list rather
  // than inside it — nothing can be dropped onto or before them.
  const pinned = entries.filter((entry) => !entry.reorderable);
  const draggable = entries.filter((entry) => entry.reorderable);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <Settings2 className="mr-1.5 h-3.5 w-3.5" />
          Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="px-3 py-2">
          <p className="font-label text-xs text-muted-foreground">
            Drag to reorder, uncheck to hide
          </p>
        </div>
        <Separator />
        <TooltipProvider delayDuration={300}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={handleDragEnd}
          >
            <ul className="relative max-h-80 overflow-y-auto py-1">
              {pinned.map((entry) => (
                <ColumnRow
                  key={entry.id}
                  entry={entry}
                  onToggle={() => toggle(entry.id)}
                />
              ))}
              <SortableContext
                items={draggable.map((entry) => entry.id)}
                strategy={verticalListSortingStrategy}
              >
                {draggable.map((entry) => (
                  <SortableColumnRow
                    key={entry.id}
                    entry={entry}
                    onToggle={() => toggle(entry.id)}
                  />
                ))}
              </SortableContext>
            </ul>
          </DndContext>
        </TooltipProvider>
        <Separator />
        <div className="px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-full"
            disabled={!isCustomised}
            onClick={reset}
          >
            Reset to default
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SortableColumnRow({
  entry,
  onToggle,
}: {
  entry: LayoutEntry;
  onToggle: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id });

  return (
    <ColumnRow
      entry={entry}
      onToggle={onToggle}
      innerRef={setNodeRef}
      // Translate only: scaling a row would distort the label mid-drag.
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition,
      }}
      isDragging={isDragging}
      handleProps={{ ...attributes, ...listeners }}
    />
  );
}

function ColumnRow({
  entry,
  onToggle,
  innerRef,
  style,
  isDragging,
  handleProps,
}: {
  entry: LayoutEntry;
  onToggle: () => void;
  innerRef?: (node: HTMLElement | null) => void;
  style?: React.CSSProperties;
  isDragging?: boolean;
  handleProps?: React.HTMLAttributes<HTMLButtonElement>;
}) {
  return (
    <li
      ref={innerRef}
      style={style}
      className={cn(
        'flex items-center gap-2 bg-background px-3 py-1.5',
        entry.reorderable && 'hover:bg-hover',
        isDragging && 'relative z-10 rounded shadow-sm',
      )}
    >
      <ColumnToggle entry={entry} onToggle={onToggle} />
      <span
        className={cn(
          'flex-1 truncate text-sm',
          !entry.visible && 'text-muted-foreground',
        )}
      >
        {entry.label}
      </span>
      {handleProps ? (
        <button
          type="button"
          {...handleProps}
          aria-label={`Reorder ${entry.label}`}
          className={cn(
            'rounded p-0.5 text-muted-foreground hover:text-foreground',
            isDragging ? 'cursor-grabbing' : 'cursor-grab',
          )}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : (
        // Keeps the label column aligned with the draggable rows below.
        <span className="w-5" aria-hidden />
      )}
    </li>
  );
}

function ColumnToggle({
  entry,
  onToggle,
}: {
  entry: LayoutEntry;
  onToggle: () => void;
}) {
  const checkbox = (
    <Checkbox
      checked={entry.visible}
      disabled={!entry.removable}
      onCheckedChange={onToggle}
      aria-label={`Show ${entry.label}`}
    />
  );

  if (entry.removable) return checkbox;

  return (
    <Tooltip>
      {/* A disabled checkbox fires no pointer events, so the span carries them. */}
      <TooltipTrigger asChild>
        <span className="flex items-center">{checkbox}</span>
      </TooltipTrigger>
      <TooltipContent side="left">
        This column can&apos;t be removed
      </TooltipContent>
    </Tooltip>
  );
}
