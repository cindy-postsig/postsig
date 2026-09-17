'use client';

import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useCreateBusinessGroup } from '@/hooks/api/useOrgUnits';
import { ApiRequestError } from '@/lib/api/v2-client';
import type { CostAllocationTabPayload } from '@/app/api/v2/handlers/cost-allocation';
import {
  useCostAllocationCatalog,
  useSaveCostAllocation,
  costAllocationQueryKey,
} from '@/hooks/api/useCostAllocation';
import { useQueryClient } from '@tanstack/react-query';
import {
  balanceMessage,
  canSaveScopes,
  editorScopeFromResolved,
  needsScopeChoice,
  scopeTotals,
  scopeValueFor,
  seatsForScope,
  toSaveScopes,
  type EditorScope,
} from '@/lib/v2/cost-allocation/editor';
import type {
  AllocationProduct,
  AllocationTargetRef,
} from '@/lib/v2/cost-allocation/types';
import { AllocationScopeEditor } from './AllocationScopeEditor';

type ScopeKind = 'contract' | 'product';

interface AllocationEditorProps {
  data: CostAllocationTabPayload;
  formatAmount: (value: number | null) => string;
  onCancel: () => void;
  onSaved: () => void;
  pickerContainer?: HTMLElement | null;
}

function initialScopeKind(
  data: CostAllocationTabPayload,
  productCount: number,
): ScopeKind | null {
  const own = data.hasOwnAllocation ? data.resolved.scopes : [];
  if (own.some((scope) => scope.productId !== null)) return 'product';
  if (own.length > 0) return 'contract';
  if (!needsScopeChoice(productCount)) return 'contract';
  const inherited = data.resolved.scopes;
  if (inherited.some((scope) => scope.productId !== null)) return 'product';
  if (inherited.length > 0) return 'contract';
  return null;
}

export function AllocationEditor({
  data,
  formatAmount,
  onCancel,
  onSaved,
  pickerContainer,
}: AllocationEditorProps) {
  const { products } = data;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const save = useSaveCostAllocation(data.contractId);
  const createGroup = useCreateBusinessGroup();
  // The org-wide picker catalog loads when the editor opens, not with the tab.
  const catalogQuery = useCostAllocationCatalog();
  const catalog = catalogQuery.data?.catalog ?? [];
  const chooserNeeded = needsScopeChoice(products.length);

  const [scopeKind, setScopeKind] = useState<ScopeKind | null>(() =>
    initialScopeKind(data, products.length),
  );
  // A single-product record inheriting a product-scoped allocation starts
  // its whole-record scope from that product's lines rather than empty.
  const [contractScope, setContractScope] = useState<EditorScope>(() =>
    editorScopeFromResolved(
      null,
      data.resolved.scopes.find((scope) => scope.productId === null) ??
        (products.length === 1
          ? data.resolved.scopes.find(
              (scope) => scope.productId === products[0].id,
            )
          : undefined),
    ),
  );
  // Keyed by product id: the page can revalidate under a mounted editor, so a
  // product added meanwhile starts empty instead of dereferencing a missing
  // positional entry.
  const [productScopes, setProductScopes] = useState<
    Record<number, EditorScope>
  >(() =>
    Object.fromEntries(
      products.map((product) => [
        product.id,
        editorScopeFromResolved(
          product.id,
          data.resolved.scopes.find((scope) => scope.productId === product.id),
        ),
      ]),
    ),
  );
  const scopeFor = (product: AllocationProduct): EditorScope =>
    productScopes[product.id] ?? editorScopeFromResolved(product.id, undefined);

  const activeScopes =
    scopeKind === 'contract'
      ? [contractScope]
      : scopeKind === 'product'
        ? products.map(scopeFor)
        : [];
  const saveable = canSaveScopes(activeScopes, data.hasOwnAllocation);

  const createBusinessGroup = async (
    name: string,
  ): Promise<AllocationTargetRef | null> => {
    try {
      const { group } = await createGroup.mutateAsync(name);
      void queryClient.invalidateQueries({
        queryKey: costAllocationQueryKey(data.contractId),
      });
      return { kind: 'org_unit', id: group.id, name: group.name };
    } catch (error) {
      toast({
        title: 'Could not create business group',
        description:
          error instanceof ApiRequestError ? error.message : undefined,
        variant: 'destructive',
      });
      return null;
    }
  };

  const handleSave = async () => {
    try {
      await save.mutateAsync(toSaveScopes(activeScopes));
      toast({ title: 'Cost allocation saved' });
      onSaved();
    } catch (error) {
      toast({
        title: 'Could not save cost allocation',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    }
  };

  const contractMessage =
    scopeKind === 'contract' &&
    contractScope.mode === 'manual' &&
    contractScope.lines.length > 0
      ? balanceMessage(scopeTotals(contractScope.lines, 0).percent)
      : null;
  const productMessage =
    scopeKind === 'product' &&
    !saveable &&
    products.some((product) => scopeFor(product).lines.length > 0)
      ? "Each product's allocation must total 100%. Adjust the percentages to continue."
      : null;

  if (catalogQuery.isLoading) {
    return (
      <div className="mt-4 space-y-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (catalogQuery.error) {
    return (
      <div className="mt-4 space-y-3">
        <Alert variant="destructive">
          <AlertTitle>Could not load allocation targets</AlertTitle>
          <AlertDescription>
            {catalogQuery.error instanceof Error
              ? catalogQuery.error.message
              : 'Try again.'}
          </AlertDescription>
        </Alert>
        {/* Without this the early return would strand a user with no way
            back to the read-only panel. */}
        <div className="flex justify-end">
          {/* Same gate as the main Cancel: unmounting mid-save does not abort
              the mutation, so the allocation would land after the user asked
              to discard it. */}
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={save.isPending}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {chooserNeeded && scopeKind !== null && (
        <p className="mt-2 text-sm text-muted-foreground">
          Allocation level:{' '}
          <span className="font-medium text-foreground">
            {scopeKind === 'contract' ? 'Entire Contract' : 'By Product'}
          </span>{' '}
          <Button
            variant="link"
            size="xs"
            onClick={() => setScopeKind(null)}
            className="ml-2 h-auto p-0 text-primary"
          >
            Change
          </Button>
        </p>
      )}

      {chooserNeeded && scopeKind === null && (
        <Alert className="mt-4">
          <AlertTitle>How would you like to allocate costs?</AlertTitle>
          <AlertDescription className="max-w-4xl text-muted-foreground">
            Choose whether to allocate costs across the total contract or assign
            specific costs to individual products.
          </AlertDescription>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setScopeKind('contract')}>
              Entire Contract
            </Button>
            <Button size="sm" onClick={() => setScopeKind('product')}>
              By Product ({products.length})
            </Button>
          </div>
        </Alert>
      )}

      {scopeKind === 'contract' && (
        <AllocationScopeEditor
          scope={contractScope}
          onChange={setContractScope}
          scopeValue={scopeValueFor(data.values, null)}
          variant="contract"
          catalog={catalog}
          levelByUnitId={data.levelByUnitId}
          seats={seatsForScope(data.seats, null)}
          onCreateBusinessGroup={createBusinessGroup}
          formatAmount={formatAmount}
          pickerContainer={pickerContainer}
        />
      )}

      {scopeKind === 'product' && (
        <div className="mt-4 space-y-3">
          {products.map((product) => (
            <AllocationScopeEditor
              key={product.id}
              scope={scopeFor(product)}
              onChange={(next) =>
                setProductScopes((prev) => ({ ...prev, [product.id]: next }))
              }
              scopeValue={scopeValueFor(data.values, product.id)}
              variant="product"
              title={product.name}
              catalog={catalog}
              levelByUnitId={data.levelByUnitId}
              seats={seatsForScope(data.seats, product.id)}
              onCreateBusinessGroup={createBusinessGroup}
              formatAmount={formatAmount}
              pickerContainer={pickerContainer}
            />
          ))}
        </div>
      )}

      {scopeKind !== null && (
        <div className="mt-6 flex items-center justify-end gap-3">
          {(contractMessage ?? productMessage) && (
            <span className="mr-auto text-sm text-destructive">
              {contractMessage ?? productMessage}
            </span>
          )}
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={save.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={!saveable || save.isPending}
          >
            {save.isPending ? 'Saving…' : 'Save Allocation'}
          </Button>
        </div>
      )}
    </div>
  );
}
