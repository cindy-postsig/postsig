'use client';

import { useMemo, useState } from 'react';
import { Building2, ChevronDown, ChevronRight, UserRound } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { LEVEL_LABEL } from '@/lib/v2/assignments/levels';
import type { OrgUnitTreeLevel } from '@/lib/v2/org-units/levels';
import { scopePath } from '@/lib/v2/assignments/scope';
import type { AssignmentsPayload, ScopeKey } from '@/lib/v2/assignments/types';
import { FIRMWIDE } from '@/lib/v2/assignments/types';

const ROW_CLASS = 'rounded-sm transition-colors';
const SELECTED_ROW_CLASS = 'bg-selected';
const IDLE_ROW_CLASS = 'text-foreground/80 hover:bg-hover';

export function ScopeTree({
  payload,
  pathLevels,
  scope,
  selectedUserId,
  onSelectScope,
  onSelectUser,
}: {
  payload: AssignmentsPayload;
  pathLevels: readonly OrgUnitTreeLevel[];
  scope: ScopeKey;
  selectedUserId: number | null;
  onSelectScope: (scope: ScopeKey) => void;
  onSelectUser: (employeeId: number) => void;
}) {
  const [search, setSearch] = useState('');
  const [manual, setManual] = useState<Record<number, boolean>>({});

  // Ancestors of the current scope are open unless the reader closed them.
  const onPath = useMemo(() => {
    const ids = new Set<number>();
    if (scope !== FIRMWIDE) {
      for (const node of scopePath(payload.nodes, scope)) ids.add(node.id);
    }
    if (selectedUserId !== null) {
      const unitId = payload.users[selectedUserId]?.orgUnitId;
      if (unitId != null) {
        for (const node of scopePath(payload.nodes, unitId)) ids.add(node.id);
      }
    }
    return ids;
  }, [payload, scope, selectedUserId]);

  const needle = search.trim().toLowerCase();
  const matches = useMemo(() => {
    if (needle.length === 0) return null;
    const ids = new Set<number>();
    for (const node of Object.values(payload.nodes)) {
      if (!node.name.toLowerCase().includes(needle)) continue;
      for (const ancestor of scopePath(payload.nodes, node.id))
        ids.add(ancestor.id);
    }
    for (const user of Object.values(payload.users)) {
      if (!user.name.toLowerCase().includes(needle)) continue;
      if (user.orgUnitId === null) continue;
      for (const ancestor of scopePath(payload.nodes, user.orgUnitId)) {
        ids.add(ancestor.id);
      }
    }
    return ids;
  }, [payload, needle]);

  const isOpen = (id: number) =>
    manual[id] ?? (matches !== null ? matches.has(id) : onPath.has(id));
  const toggle = (id: number) =>
    setManual((current) => ({ ...current, [id]: !isOpen(id) }));

  // Filtered by the same needle the tree nodes are: a search that leaves every
  // unplaced person on screen is not a search.
  const unplaced = useMemo(
    () =>
      Object.values(payload.users).filter(
        (user) =>
          user.orgUnitId === null &&
          (needle === '' || user.name.toLowerCase().includes(needle)),
      ),
    [payload.users, needle],
  );

  const firmwideSelected = scope === FIRMWIDE && selectedUserId === null;

  return (
    <nav
      aria-label="HR structure"
      className="min-h-[calc(100vh-3.5rem)] w-full"
    >
      <div className="sticky top-14 flex flex-col gap-3 pt-4">
        <p className="px-4 font-label text-xs uppercase tracking-wide text-muted-foreground">
          HR structure
        </p>
        <div className="px-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Jump to level or user"
            aria-label="Jump to level or user"
            className="h-8 text-sm"
          />
        </div>

        <ul className="flex max-h-[70vh] flex-col overflow-y-auto px-2 text-sm">
          <li>
            <button
              type="button"
              onClick={() => onSelectScope(FIRMWIDE)}
              className={cn(
                'flex w-full items-center gap-2 px-2 py-1.5 text-left',
                ROW_CLASS,
                firmwideSelected ? SELECTED_ROW_CLASS : IDLE_ROW_CLASS,
              )}
            >
              <Building2
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              />
              Firmwide
            </button>
          </li>
          {payload.rootIds.map((id) => (
            <TreeNode
              key={id}
              id={id}
              depth={0}
              payload={payload}
              scope={scope}
              selectedUserId={selectedUserId}
              isOpen={isOpen}
              onToggle={toggle}
              onSelectScope={onSelectScope}
              onSelectUser={onSelectUser}
              visible={matches}
              needle={needle}
            />
          ))}
          {unplaced.map((user) => (
            <li key={`unplaced-${user.id}`}>
              <PersonRow
                name={user.name}
                depth={1}
                selected={selectedUserId === user.id}
                onSelect={() => onSelectUser(user.id)}
              />
            </li>
          ))}
        </ul>

        <p className="mx-2 border-t border-border px-2 pt-3 text-xs leading-relaxed text-muted-foreground">
          {[...pathLevels.map((level) => LEVEL_LABEL[level]), 'User'].join(
            ' → ',
          )}
          . Select any level to scope the tables on the right.
        </p>
      </div>
    </nav>
  );
}

function TreeNode({
  id,
  depth,
  payload,
  scope,
  selectedUserId,
  isOpen,
  onToggle,
  onSelectScope,
  onSelectUser,
  visible,
  needle,
}: {
  id: number;
  depth: number;
  payload: AssignmentsPayload;
  scope: ScopeKey;
  selectedUserId: number | null;
  isOpen: (id: number) => boolean;
  onToggle: (id: number) => void;
  onSelectScope: (scope: ScopeKey) => void;
  onSelectUser: (employeeId: number) => void;
  visible: Set<number> | null;
  needle: string;
}) {
  const node = payload.nodes[id];
  if (!node) return null;
  if (visible !== null && !visible.has(id)) return null;

  const open = isOpen(id);
  const expandable = node.childIds.length > 0 || node.memberIds.length > 0;
  const selected = scope === id && selectedUserId === null;

  return (
    <li>
      <div
        className={cn(
          'flex items-center gap-1 pr-2',
          ROW_CLASS,
          selected ? SELECTED_ROW_CLASS : IDLE_ROW_CLASS,
        )}
        style={{ paddingLeft: depth * 12 }}
      >
        {expandable ? (
          <button
            type="button"
            onClick={() => onToggle(id)}
            aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
            aria-expanded={open}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="w-[1.125rem]" aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={() => onSelectScope(id)}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 py-1.5 text-left"
        >
          <span className="truncate">{node.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {node.headcount}
          </span>
        </button>
      </div>
      {open && (
        <ul>
          {node.childIds.map((childId) => (
            <TreeNode
              key={childId}
              id={childId}
              depth={depth + 1}
              payload={payload}
              scope={scope}
              selectedUserId={selectedUserId}
              isOpen={isOpen}
              onToggle={onToggle}
              onSelectScope={onSelectScope}
              onSelectUser={onSelectUser}
              visible={visible}
              needle={needle}
            />
          ))}
          {node.memberIds
            .map((memberId) => payload.users[memberId])
            .filter(
              (user) =>
                user &&
                (needle === '' || user.name.toLowerCase().includes(needle)),
            )
            .map((user) => (
              <li key={`user-${user.id}`}>
                <PersonRow
                  name={user.name}
                  depth={depth + 1}
                  selected={selectedUserId === user.id}
                  onSelect={() => onSelectUser(user.id)}
                />
              </li>
            ))}
        </ul>
      )}
    </li>
  );
}

function PersonRow({
  name,
  depth,
  selected,
  onSelect,
}: {
  name: string;
  depth: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{ paddingLeft: depth * 12 + 22 }}
      className={cn(
        'flex w-full items-center gap-1.5 py-1.5 pr-2 text-left',
        ROW_CLASS,
        selected ? SELECTED_ROW_CLASS : IDLE_ROW_CLASS,
      )}
    >
      <UserRound
        aria-hidden="true"
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
      />
      <span className="truncate">{name}</span>
    </button>
  );
}
