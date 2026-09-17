'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { NonInvoiceDescendant } from '@/lib/v2/contracts/archive';

type ConfirmArchiveChildren = (
  children: NonInvoiceDescendant[],
) => Promise<boolean>;

const ArchiveChildrenConfirmContext =
  createContext<ConfirmArchiveChildren | null>(null);

/**
 * Returns a function that prompts the user to also archive the given non-invoice
 * child contracts. Resolves `true` when they choose "Archive all". If no provider
 * is mounted it declines, so invoice children still cascade but non-invoice ones
 * are left untouched.
 */
export function useArchiveChildrenConfirm(): ConfirmArchiveChildren {
  const confirm = useContext(ArchiveChildrenConfirmContext);
  return confirm ?? (async () => false);
}

function describeChildren(children: NonInvoiceDescendant[]): string {
  const byType = new Map<string, number>();
  for (const child of children) {
    byType.set(child.typeName, (byType.get(child.typeName) ?? 0) + 1);
  }
  const breakdown = [...byType.entries()]
    .map(([name, count]) => `${count} ${name}`)
    .join(', ');
  const total = children.length;
  const noun = total === 1 ? 'contract' : 'contracts';
  const pronoun = total === 1 ? 'it' : 'them';
  return `This contract has ${total} related non-invoice ${noun} (${breakdown}). Archive ${pronoun} too?`;
}

export function ArchiveChildrenConfirmProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<NonInvoiceDescendant[]>([]);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmArchiveChildren>((items) => {
    setPending(items);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    setOpen(false);
    resolverRef.current?.(value);
    resolverRef.current = null;
  }, []);

  return (
    <ArchiveChildrenConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) settle(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive related contracts?</AlertDialogTitle>
            <AlertDialogDescription>
              {describeChildren(pending)} Their invoices are archived either
              way.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              Keep them active
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => settle(true)}>
              Archive all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ArchiveChildrenConfirmContext.Provider>
  );
}
