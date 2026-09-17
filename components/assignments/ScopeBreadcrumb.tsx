'use client';

import { Fragment } from 'react';
import { Building2 } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { scopePath } from '@/lib/v2/assignments/scope';
import type { AssignmentNode, ScopeKey } from '@/lib/v2/assignments/types';
import { FIRMWIDE } from '@/lib/v2/assignments/types';

export const FIRMWIDE_LABEL = 'Firmwide';

interface Crumb {
  key: string;
  label: string;
  levelLabel?: string;
  /** Absent on the person crumb, which is not a scope to return to. */
  scope?: ScopeKey;
}

/**
 * The trail back up, kept to Firmwide, the parent and the current step. The
 * levels in between fold into one menu, so a person four levels down reads
 * as three crumbs rather than six.
 */
export function ScopeBreadcrumb({
  nodes,
  scope,
  userName,
  onSelect,
}: {
  nodes: Readonly<Record<number, AssignmentNode>>;
  scope: ScopeKey;
  userName?: string;
  onSelect: (scope: ScopeKey) => void;
}) {
  const trail = scope === FIRMWIDE ? [] : scopePath(nodes, scope);
  const crumbs: Crumb[] = [
    { key: 'firmwide', label: FIRMWIDE_LABEL, scope: FIRMWIDE },
    ...trail.map((node) => ({
      key: String(node.id),
      label: node.name,
      levelLabel: node.levelLabel,
      scope: node.id,
    })),
    ...(userName !== undefined
      ? [{ key: 'user', label: userName, levelLabel: 'User' }]
      : []),
  ];
  const folded = crumbs.length > 3 ? crumbs.slice(1, -2) : [];
  const tail = crumbs.slice(1 + folded.length);

  return (
    <Breadcrumb aria-label="Breadcrumb">
      <BreadcrumbList>
        <BreadcrumbItem>
          <CrumbStep
            crumb={crumbs[0]}
            current={crumbs.length === 1}
            onSelect={onSelect}
          >
            <Building2 aria-hidden="true" className="h-3.5 w-3.5" />
            {FIRMWIDE_LABEL}
          </CrumbStep>
        </BreadcrumbItem>
        {folded.length > 0 && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Show hidden levels"
                  className="flex items-center rounded hover:text-foreground"
                >
                  <BreadcrumbEllipsis className="h-5 w-5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {folded.map((crumb) => (
                    <DropdownMenuItem
                      key={crumb.key}
                      onSelect={() => onSelect(crumb.scope ?? FIRMWIDE)}
                    >
                      <LevelCaption label={crumb.levelLabel} />
                      {crumb.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </BreadcrumbItem>
          </>
        )}
        {tail.map((crumb, index) => (
          <Fragment key={crumb.key}>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <CrumbStep
                crumb={crumb}
                current={index === tail.length - 1}
                onSelect={onSelect}
              >
                {crumb.label}
              </CrumbStep>
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function CrumbStep({
  crumb,
  current,
  onSelect,
  children,
}: {
  crumb: Crumb;
  current: boolean;
  onSelect: (scope: ScopeKey) => void;
  children: React.ReactNode;
}) {
  if (current || crumb.scope === undefined) {
    return (
      <BreadcrumbPage className="font-medium flex items-center gap-1.5 text-foreground">
        {children}
      </BreadcrumbPage>
    );
  }
  const scope = crumb.scope;
  return (
    <BreadcrumbLink asChild>
      <button
        type="button"
        onClick={() => onSelect(scope)}
        className="flex items-center gap-1.5"
      >
        {children}
      </button>
    </BreadcrumbLink>
  );
}

function LevelCaption({ label }: { label?: string }) {
  if (!label) return null;
  return (
    <span className="font-label text-[0.65rem] uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
  );
}
