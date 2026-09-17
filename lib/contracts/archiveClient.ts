import type {
  NonInvoiceDescendant,
  ReactivatableChild,
} from '@/lib/v2/contracts/archive';

type ConfirmArchiveChildren = (
  children: NonInvoiceDescendant[],
) => Promise<boolean>;

type SelectReactivateChildren = (
  children: ReactivatableChild[],
) => Promise<number[]>;

/**
 * Archive the given contracts. Invoice descendants always cascade (enforced
 * server-side); if a contract has non-invoice descendants the user is prompted,
 * and they are archived only when confirmed. The preview is best-effort — if it
 * fails, the update still archives the roots and their invoice descendants.
 */
export async function requestArchiveWithChildren(
  contractIds: (number | string)[],
  confirm: ConfirmArchiveChildren,
): Promise<Response> {
  let archiveNonInvoiceChildren = false;

  try {
    const previewResponse = await fetch('/api/contracts/archive-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractIds }),
    });

    if (previewResponse.ok) {
      const { nonInvoiceDescendants } = await previewResponse.json();
      if (
        Array.isArray(nonInvoiceDescendants) &&
        nonInvoiceDescendants.length > 0
      ) {
        archiveNonInvoiceChildren = await confirm(nonInvoiceDescendants);
      }
    }
  } catch {
    // Best-effort preview; the update route still cascades invoice children.
  }

  return fetch('/api/contracts/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contractIds,
      status: 'inactive',
      archiveNonInvoiceChildren,
    }),
  });
}

/**
 * After a parent has been reactivated, offer to also reactivate its archived
 * descendants: the user picks from a popup which archived children (invoices and
 * non-invoices) to mark active. Returns whether any child was reactivated so the
 * caller can refresh. Preview is best-effort — on failure it simply skips.
 */
export async function reactivateChildrenAfterParent(
  parentContractIds: (number | string)[],
  select: SelectReactivateChildren,
): Promise<boolean> {
  let children: ReactivatableChild[] = [];

  try {
    const previewResponse = await fetch('/api/contracts/reactivate-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractIds: parentContractIds }),
    });

    if (previewResponse.ok) {
      const body = await previewResponse.json();
      if (Array.isArray(body.children)) children = body.children;
    }
  } catch {
    return false;
  }

  if (children.length === 0) return false;

  const selectedIds = await select(children);
  if (selectedIds.length === 0) return false;

  const response = await fetch('/api/contracts/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contractIds: selectedIds,
      status: 'active',
      updateStatusOnly: true,
    }),
  });

  return response.ok;
}
