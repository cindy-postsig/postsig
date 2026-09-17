'use client';

import { useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { enrichContractProducts } from '@/lib/v2/products/transforms';
import AmendmentAccordion from './amendments/AmendmentAccordion';
import { ProductTableRenderer } from './ProductTableRenderer';
import { useHierarchy } from '@/contexts/HierarchyContext';
import { buildRemovedProductKeys } from '@/lib/contracts/productLineageResolution';
import { getRelationship } from '@/lib/amendments/amendmentService';
import { useFilteredLineageData } from '@/hooks/useFilteredLineageData';
import { areProductsDifferent } from '@/lib/amendments/productComparison';
import { useEdit } from '@/app/ui/contracts/edit/EditContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DotsHorizontalIcon, Pencil2Icon } from '@radix-ui/react-icons';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { generateToastError } from '@/utils/toast';
import logger from '@/utils/pino';
import { useDateFormat } from '@/hooks/useDateFormat';
import { formatFxRate } from '@/app/lib/utils';
import type { ContractProduct } from '@/lib/v2/products/transforms';
import type {
  DateEntry,
  SalesTaxDetail,
  VendorProduct,
  VendorProductsDetail,
  VendorProductsUser,
  RawProductData,
} from '@/lib/v2/products/types';
import type { Citation } from '@/constants/types';
import type { HierarchyProductsData } from '@/components/contracts/amendments/productComparisonUtils';
import { isInvoiceType } from '@/app/lib/constants';

interface ProductsLicensedContractData {
  id: number;
  type_id?: number;
  currency?: string | null;
  annual_increase?: number | null;
  renewal_type?: string | null;
  term_start_date?: DateEntry[];
  vendor_products_details?: VendorProductsDetail[];
  vendor_products_users?: VendorProductsUser[];
  other_attributes?: {
    invoice_fields?: {
      sales_tax_details?: SalesTaxDetail[];
    };
  };
}

type ProductsLicensedProps = {
  data: ProductsLicensedContractData;
  citations?: Citation;
  deliveryMethods?: Array<{ id: number; name: string }>;
};

interface ProductAmendmentChainItem {
  contractId: number;
  value: Record<string, ContractProduct[]>;
  isOriginal: boolean;
  relationship: 'current' | 'parent' | 'child';
  localAmendmentId: string;
}

export default function ProductsLicensed({
  data,
  citations,
  deliveryMethods = [],
}: ProductsLicensedProps) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const contractId = data?.id as number;

  // Get hierarchy data from context
  const {
    hierarchyProductsData,
    completeHierarchy,
    fiscalYearStartMonth,
    removedProductIdsByContract,
  } = useHierarchy();

  // Filter hierarchyProductsData to only include contracts in the direct lineage
  // This ensures product checks only consider ancestors + current + descendants (no siblings/cousins)
  const filteredHierarchyProductsData = useFilteredLineageData(
    hierarchyProductsData,
    data?.id,
    completeHierarchy,
  );

  // Helper: Check if a contract has products
  const contractHasProducts = (contract: HierarchyProductsData) => {
    return Object.keys(contract?.products || {}).length > 0;
  };

  const hasProducts = (data?.vendor_products_details?.length ?? 0) > 0;
  const hasProductsInHierarchy =
    filteredHierarchyProductsData.some(contractHasProducts);

  // Extract sales tax data from other_attributes
  const salesTaxDetails =
    data?.other_attributes?.invoice_fields?.sales_tax_details || [];

  // Fees below are the contract's own amounts. The FX stamp the products carry
  // discloses the rate behind the base-currency figures this contract shows up
  // as wherever it is rolled up with others; it is absent when no conversion
  // was needed or no quote existed.
  const fxStamp =
    (data?.vendor_products_details ?? []).find(
      (detail) => detail.fxRate != null && detail.fxTargetCurrency,
    ) ?? null;

  // Enrich contract with products data (price history, period info)
  const {
    productsByYear,
    hasValidTermDate,
    sortedYears,
    currency,
    hasAnnualIncrease,
  } = enrichContractProducts(data, fiscalYearStartMonth);

  // Confirmed cancellation declarations (PSK-1830). undefined when nothing is
  // struck, so the zero-event render path is identical to before this existed.
  //
  // Invoices are exempt: an invoice is never itself cancelled, only the
  // agreement commanding it is, so billing that already happened on its own
  // dates stays valid. The resolver strikes any preceding chain contract
  // regardless of type, so the guard belongs here rather than upstream.
  const removedProducts = useMemo(
    () =>
      isInvoiceType(data?.type_id)
        ? undefined
        : buildRemovedProductKeys(
            removedProductIdsByContract.get(contractId),
            productsByYear,
          ),
    [removedProductIdsByContract, contractId, productsByYear, data?.type_id],
  );

  // Build amendment chain using normalized hierarchy data
  const buildProductAmendmentChain = () => {
    if (!filteredHierarchyProductsData.length) {
      return { chain: [], hasChain: false };
    }

    // Find current contract in hierarchy (may or may not have products)
    const currentHierarchyData = filteredHierarchyProductsData.find(
      (h) => h.contractId === data.id,
    );

    // Get current products (empty array if current has no products)
    const currentProducts = currentHierarchyData
      ? Object.values(currentHierarchyData.products ?? {}).flat()
      : [];

    // Unified filtering logic: include contracts that have products AND
    // either are current OR have products that differ from current
    const chainContracts = filteredHierarchyProductsData
      .filter((hierarchyContract) => {
        // Skip contracts with no products
        if (!contractHasProducts(hierarchyContract)) {
          return false;
        }

        // Always include the current contract if it has products
        if (hierarchyContract.contractId === data.id) {
          return true;
        }

        // Include other contracts only if their products differ from current
        const contractProducts = Object.values(
          hierarchyContract.products ?? {},
        ).flat();
        return areProductsDifferent(contractProducts, currentProducts);
      })
      .map((hierarchyContract) => ({
        contractId: hierarchyContract.contractId,
        value: hierarchyContract.products,
        isOriginal: hierarchyContract.contractId !== data.id,
        relationship: getRelationship(
          hierarchyContract.contractId,
          data.id,
          completeHierarchy,
        ),
        localAmendmentId:
          hierarchyContract.contractData.localAmendmentId ||
          hierarchyContract.contractData.localId,
      }));

    // Only show amendment accordion if there are OTHER contracts (besides current) with products
    const hasOtherContracts = chainContracts.some(
      (c) => c.contractId !== data.id,
    );

    return {
      chain: chainContracts,
      hasChain: hasOtherContracts,
    };
  };

  const productAmendmentData = buildProductAmendmentChain();
  const isInvoice = isInvoiceType(data?.type_id);
  const hasRelatedProducts = productAmendmentData.hasChain && !isInvoice;

  if (!hasProducts && !hasProductsInHierarchy) {
    return <></>;
  }

  // Extract vendor products from vendor_products_details (they're nested in the query)
  const vendorProducts = (data.vendor_products_details || [])
    .map((detail) => detail.vendor_products)
    .filter((vp): vp is VendorProduct => vp != null)
    .filter(
      (vp, index, self) => self.findIndex((v) => v.id === vp.id) === index,
    );

  return (
    <ProductsLicensedContent
      hasProducts={hasProducts}
      isHistoryOpen={isHistoryOpen}
      hasRelatedProducts={hasRelatedProducts}
      productsByYear={productsByYear}
      hasValidTermDate={hasValidTermDate}
      sortedYears={sortedYears}
      currency={currency}
      hasAnnualIncrease={hasAnnualIncrease}
      isInvoice={isInvoice}
      salesTaxDetails={salesTaxDetails}
      termStartDate={data.term_start_date}
      fiscalYearStartMonth={fiscalYearStartMonth}
      citations={citations}
      productAmendmentData={productAmendmentData}
      currentContractId={data.id}
      setIsHistoryOpen={setIsHistoryOpen}
      fxStamp={fxStamp}
      rawProductData={{
        vendorProductsDetails: data.vendor_products_details || [],
        vendorProductsUsers: data.vendor_products_users || [],
        vendorProducts: vendorProducts,
      }}
      deliveryMethods={deliveryMethods}
      removedProducts={removedProducts}
    />
  );
}

function ProductsLicensedContent({
  hasProducts,
  isHistoryOpen,
  hasRelatedProducts,
  productsByYear,
  hasValidTermDate,
  sortedYears,
  currency,
  hasAnnualIncrease,
  isInvoice,
  salesTaxDetails,
  termStartDate,
  fiscalYearStartMonth,
  citations,
  productAmendmentData,
  currentContractId,
  setIsHistoryOpen,
  fxStamp,
  rawProductData,
  deliveryMethods,
  removedProducts,
}: {
  hasProducts: boolean;
  isHistoryOpen: boolean;
  hasRelatedProducts: boolean;
  productsByYear: Record<string, ContractProduct[]>;
  hasValidTermDate: boolean;
  sortedYears: string[];
  currency: string | null | undefined;
  hasAnnualIncrease: boolean;
  isInvoice: boolean;
  salesTaxDetails: SalesTaxDetail[];
  termStartDate: DateEntry[] | undefined;
  fiscalYearStartMonth: number;
  citations?: Citation;
  productAmendmentData: {
    chain: ProductAmendmentChainItem[];
    hasChain: boolean;
  };
  currentContractId: number;
  setIsHistoryOpen: (open: boolean) => void;
  fxStamp: VendorProductsDetail | null;
  rawProductData: RawProductData;
  deliveryMethods: Array<{ id: number; name: string }>;
  removedProducts: Set<string> | undefined;
}) {
  const [isProductEditMode, setIsProductEditMode] = useState(false);
  const edit = useEdit();
  const { formatDate } = useDateFormat();
  const { toast } = useToast();
  const canEdit = edit?.canEdit ?? false;
  const isGlobalEditMode = edit?.isEditMode ?? false;

  const isEditMode = isGlobalEditMode || isProductEditMode;

  const handleSave = async () => {
    if (!edit) return;
    try {
      const result = await edit.saveAllChanges();
      if (result.success) {
        setIsProductEditMode(false);
      } else {
        logger.error({ error: result.error }, 'Failed to save product edits');
        toast(
          generateToastError(
            result.error || 'Failed to save changes',
            'Save failed',
          ),
        );
      }
    } catch (error) {
      logger.error({ error }, 'Unexpected error saving product edits');
      toast(
        generateToastError(
          'An unexpected error occurred while saving',
          'Save failed',
        ),
      );
    }
  };

  const handleCancel = () => {
    edit?.clearAllChanges();
    setIsProductEditMode(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>
          {isInvoice ? 'Summary of Charges' : 'Products Licensed'}
        </CardTitle>
        {canEdit && !isEditMode && hasProducts && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-sm outline-none hover:bg-gray-700/10">
              <DotsHorizontalIcon width={18} height={18} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setIsProductEditMode(true)}>
                <Pencil2Icon className="mr-2 h-4 w-4" />
                <span>Edit</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardHeader>
      <CardContent>
        {hasProducts && (
          <div
            className={`transition-all duration-300 ease-in-out ${
              isHistoryOpen && hasRelatedProducts ? 'hidden' : ''
            }`}
          >
            <ProductTableRenderer
              productsData={{
                productsByYear,
                hasValidTermDate,
                sortedYears,
              }}
              contractMetadata={{
                currency: currency ?? undefined,
                hasAnnualIncrease,
                isInvoice,
                salesTaxDetails,
                termStartDate,
                fiscalYearStartMonth,
              }}
              citations={citations}
              rawProductData={rawProductData}
              deliveryMethods={deliveryMethods}
              isProductEditMode={isProductEditMode}
              comparisonData={removedProducts ? { removedProducts } : undefined}
            />
            {fxStamp?.fxRate != null && (
              <p className="mt-3 text-xs text-muted-foreground">
                Converted to {fxStamp.fxTargetCurrency} at{' '}
                {formatFxRate(fxStamp.fxRate)}
                {fxStamp.fxDate
                  ? ` · rate as of ${formatDate(fxStamp.fxDate)}`
                  : ''}
              </p>
            )}
          </div>
        )}

        {hasRelatedProducts && !isEditMode && (
          <div className="">
            <AmendmentAccordion
              fieldKey="products_licensed"
              fieldTitle="Products Licensed"
              currentValue="Current Products"
              relatedContracts={productAmendmentData.chain}
              currentContractId={currentContractId}
              viewContext="chain"
              isHistoryOpen={isHistoryOpen}
              onToggleHistory={setIsHistoryOpen}
            />
          </div>
        )}

        {isProductEditMode && (
          <div className="mt-4 flex items-center justify-end gap-2 border-t pt-4">
            <span className="mr-auto text-sm text-muted-foreground">
              {edit?.editedFieldCount ?? 0} field(s) modified
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={edit?.isSaving}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!edit?.hasChanges || edit?.isSaving}
            >
              {edit?.isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
