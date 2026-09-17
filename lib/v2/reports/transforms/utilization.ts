/**
 * Utilization Report Transform
 *
 * Extends base contract table row with utilization metrics.
 */

import { buildContractTableRow } from '@/lib/v2/contracts/transforms';
import { EnrichedContract } from '@/lib/v2/contracts/service';
import type { ContractTableRow, ProductUsageSubRow } from '@/lib/v2/core/types';
import { calculateProductUsage } from '@/app/lib/budget/productUsage';

/**
 * Product usage item from calculateProductUsage's byProduct map
 */
export interface ProductUsageItem {
  id: number;
  name: string;
  seats: {
    assigned: number;
    licensed: number;
    value: number;
    valuePerSeat: number;
    unusedSeatsValue: number;
  };
  users: Array<{
    id: number;
    name: string;
    email: string;
  }>;
}

export type UtilizationReportRow = Omit<ContractTableRow, 'subRows'> & {
  productUsage: ReturnType<typeof calculateProductUsage>;
  seatUsage: {
    assigned: number;
    licensed: number;
  };
  seatUsageDisplay: string;
  utilizationPercentage: number;
  pricePerSeat: number;
  potentialOverage: number;
  unusedSeatsValue: number;
  singleAllocatedProduct?: { id: string | number; name: string };
  subRows?: ProductUsageSubRow[];
  isEnterprise?: boolean;
};

/**
 * Calculate potential overage (unused-seat value).
 */
function calculatePotentialOverage(
  assignedSeats: number,
  licensedSeats: number,
  totalFees: number,
): number {
  if (licensedSeats <= 0) return 0;
  const unusedSeats = Math.max(0, licensedSeats - assignedSeats);
  const valuePerSeat = totalFees / licensedSeats;
  return unusedSeats * valuePerSeat;
}

/**
 * Build a utilization report row from an enriched contract.
 */
export function buildUtilizationRow(
  contract: EnrichedContract,
): UtilizationReportRow {
  const base = buildContractTableRow(contract);

  // Check if any product on this contract is enterprise-licensed
  const isEnterprise =
    contract.contract.vendor_products_users?.some(
      (vpu: { enterprise?: boolean }) => vpu.enterprise === true,
    ) ?? false;

  // Get current budget (native currency for display)
  const currentBudget = base.currentBudget || 0;

  // Build currentProducts in the format calculateProductUsage expects (native currency)
  const currentProducts = contract.products.map((p) => ({
    vendor_products: {
      id: p.product_id,
      name: p.name,
    },
    fees: p.currentFee,
    compoundedFees: p.currentFee,
    isSuperseded: p.isSuperseded,
  }));

  // Calculate product usage data
  const productUsage = calculateProductUsage(
    contract.contract,
    currentProducts,
    currentBudget,
  );

  // Get seat usage totals
  const assignedSeats = productUsage.totalSeats.assigned;
  const licensedSeats = productUsage.totalSeats.licensed;

  // Calculate utilization percentage (0-100)
  const utilizationPercentage =
    licensedSeats > 0 ? Math.round((assignedSeats / licensedSeats) * 100) : 0;

  // Calculate price per seat (native currency)
  const pricePerSeat = licensedSeats > 0 ? currentBudget / licensedSeats : 0;

  // Potential overage (value of unused seats)
  const potentialOverage = productUsage.totalSeats.unusedSeatsValue || 0;

  // Display string for seat usage
  const seatUsageDisplay = `${assignedSeats}/${licensedSeats}`;

  // Get products with licenses > 0 for subrows
  const productsWithLicenses: ProductUsageItem[] = productUsage.byProduct
    ? Object.values(productUsage.byProduct).filter(
        (product) => product.seats?.licensed > 0,
      )
    : [];

  // Build subrows or set singleAllocatedProduct based on count
  let singleAllocatedProduct: { id: string | number; name: string } | undefined;
  let subRows: ProductUsageSubRow[] = [];

  if (productsWithLicenses.length === 1) {
    // Single product - add info to main row
    const licensedProduct = productsWithLicenses[0];
    singleAllocatedProduct = {
      id: licensedProduct.id,
      name: licensedProduct.name,
    };
  } else if (productsWithLicenses.length > 1) {
    // Multiple products - create minimal subrows with only utilization data
    subRows = productsWithLicenses.map(
      (productUsageItem): ProductUsageSubRow => {
        const isEnterpriseProduct =
          contract.contract.vendor_products_users?.some(
            (vpu: { product_id?: number; enterprise?: boolean }) =>
              vpu.product_id === productUsageItem.id && vpu.enterprise === true,
          ) ?? false;

        // Find matching product for fees and superseded status
        const matchingProduct = currentProducts.find(
          (p) => p.vendor_products?.id === productUsageItem.id,
        );
        const productFees = matchingProduct
          ? parseFloat(matchingProduct.compoundedFees.toString()) || 0
          : 0;
        const isSuperseded = matchingProduct?.isSuperseded || false;

        // Calculate potential overage for this product
        const unusedSeatsValue = calculatePotentialOverage(
          productUsageItem.seats.assigned,
          productUsageItem.seats.licensed,
          productFees,
        );

        const valuePerSeat =
          productUsageItem.seats.licensed > 0
            ? productFees / productUsageItem.seats.licensed
            : 0;

        return {
          id: `report-usage-${contract.id}-${productUsageItem.id}`,
          contract_id: String(contract.id),
          product: [
            {
              vendor_products: {
                id: productUsageItem.id,
                name: productUsageItem.name,
              },
            },
          ],
          productUsage: {
            totalSeats: {
              assigned: productUsageItem.seats.assigned,
              licensed: productUsageItem.seats.licensed,
              value: productFees,
              valuePerSeat,
              unusedSeatsValue,
            },
          },
          seatUsage: {
            assigned: productUsageItem.seats.assigned,
            licensed: productUsageItem.seats.licensed,
          },
          potentialOverage: unusedSeatsValue,
          currency: base.currency || '',
          isReportRow: true,
          isProductUsageRow: true,
          isSuperseded,
          isEnterprise: isEnterpriseProduct,
          reportType: 'utilization',
        };
      },
    );
  }

  return {
    ...base,
    productUsage,
    seatUsage: {
      assigned: assignedSeats,
      licensed: licensedSeats,
    },
    seatUsageDisplay: isEnterprise ? 'Enterprise' : seatUsageDisplay,
    utilizationPercentage,
    pricePerSeat,
    potentialOverage,
    unusedSeatsValue: potentialOverage,
    singleAllocatedProduct,
    subRows: subRows.length > 0 ? subRows : undefined,
    isEnterprise,
  };
}
