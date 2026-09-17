'use client';

import { PlusIcon, MinusIcon } from '@heroicons/react/24/outline';

import { cn } from '@/lib/utils';

/**
 * The expand/collapse control a nesting row carries next to its own content,
 * rather than in the expander gutter — the product column's product count, an
 * allocation target with children. Takes plain state so a table that is not a
 * TanStack one (the allocation summary) renders the same control.
 *
 * A real button, not a click handler on the icon: the control has to be
 * reachable and announced, and the rows carrying it are themselves clickable,
 * so it must also stop the row from opening underneath it.
 */
export function InlineExpandToggle({
  expanded,
  onToggle,
  size = 'default',
  className,
}: {
  expanded: boolean;
  onToggle: () => void;
  /**
   * 'sm' is the nested-row control: smaller, and one tint across both states
   * rather than filling in when open — the contracts lineage tree's rule. At
   * this size the solid fill reads as a second bullet down the indent.
   */
  size?: 'default' | 'sm';
  className?: string;
}) {
  const Icon = expanded ? MinusIcon : PlusIcon;
  const dimension = size === 'sm' ? 18 : 24;
  return (
    <button
      type="button"
      aria-label={expanded ? 'Collapse' : 'Expand'}
      aria-expanded={expanded}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        'shrink-0 bg-transparent p-0 hover:bg-transparent',
        className,
      )}
    >
      <Icon
        className={cn(
          'cursor-pointer',
          size === 'sm'
            ? 'rounded-full bg-primary/15 p-[3px] text-primary'
            : cn(
                'min-w-[24px] rounded-xl p-1',
                expanded
                  ? 'bg-primary text-background'
                  : 'bg-primary/15 text-primary',
              ),
        )}
        width={dimension}
        height={dimension}
      />
    </button>
  );
}
