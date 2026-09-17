'use client';

import React from 'react';
import { ProductTableRenderer } from '@/components/contracts/ProductTableRenderer';
import type { ContractProduct } from '@/lib/v2/products/transforms';
import type { DateEntry, SalesTaxDetail } from '@/lib/v2/products/types';

interface AmendmentData {
  contractId: number;
  value: unknown;
  isOriginal: boolean;
  relationship: 'current' | 'parent' | 'child';
  localAmendmentId?: string;
}

/**
 * Contract data structure with fields needed for formatting
 */
interface ContractDataForFormatting {
  currency?: string;
  annual_increase?: number;
  renewal_type?: string;
  term_start_date?: DateEntry[];
  other_attributes?: {
    invoice_fields?: {
      sales_tax_details?: SalesTaxDetail[];
    };
  };
}

/**
 * Product comparison data from createProductComparison
 */
interface ProductComparisonData {
  productDifferences: Map<
    string,
    'added' | 'price_increased' | 'price_decreased' | 'unchanged' | 'removed'
  >;
  predecessorYears?: Set<number>;
  supersededProducts?: Set<string>;
  removedProducts?: Set<string>;
}

/**
 * Format field values for display, handling different data types
 */
export function formatValue(
  value: unknown,
  fieldKey?: string,
  contractData?: ContractDataForFormatting,
  relatedContracts?: AmendmentData[],
  currentContractData?: ContractDataForFormatting,
  preComputedComparisonData?: ProductComparisonData,
  fiscalYearStartMonth: number = 1,
): React.ReactNode {
  if (value === null || value === undefined) {
    return 'N/A';
  }
  if (typeof value === 'string' && value.trim() === '') {
    return 'N/A';
  }

  // Handle special products field that needs full table rendering with comparison
  if (
    fieldKey === 'products_licensed' &&
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    contractData
  ) {
    // value is the productsByYear object from getCurrentTermProducts
    // Pass it directly to ProductTableRenderer (no re-calculation needed)
    // contractData contains the full contract data for currency, annual_increase, etc.
    const productsByYear = value as Record<string, ContractProduct[]>;

    const sortedYears = Object.keys(productsByYear).sort(
      (a, b) => Number(a) - Number(b),
    );
    const hasAnnualIncrease =
      contractData.annual_increase !== undefined &&
      contractData.annual_increase !== null &&
      contractData.renewal_type !== 'One-Time';
    const salesTaxDetails =
      contractData.other_attributes?.invoice_fields?.sales_tax_details || [];

    return (
      <ProductTableRenderer
        productsData={{
          productsByYear,
          hasValidTermDate: sortedYears.length > 0,
          sortedYears,
        }}
        contractMetadata={{
          currency: contractData.currency,
          hasAnnualIncrease,
          salesTaxDetails,
          termStartDate: contractData.term_start_date,
          fiscalYearStartMonth,
        }}
        comparisonData={preComputedComparisonData}
        isAmendmentView={true}
      />
    );
  }

  // Handle JSX fields that need special rendering
  // Note: contractData here is amendment metadata, not full contract data
  // For now, we'll handle these fields as text until we can pass full contract data
  if (
    fieldKey &&
    (fieldKey === 'number_of_users' || fieldKey === 'data_delivery_types')
  ) {
    // For number_of_users, try to extract meaningful text from the value
    if (fieldKey === 'number_of_users' && value && typeof value === 'object') {
      if (Array.isArray(value)) {
        return value
          .map((vpu: any) => `${vpu?.number_of_users ?? 'N/A'} Users`)
          .join(', ');
      }
      const numUsers = (value as any).number_of_users;
      return `${numUsers ?? 'N/A'} Users`;
    }

    // For data_delivery_types, try to extract meaningful text from the value
    if (fieldKey === 'data_delivery_types' && value && Array.isArray(value)) {
      return value
        .map(
          (item: any) =>
            item?.data_delivery_types?.name || item?.name || 'Unknown',
        )
        .join(', ');
    }
  }

  // Handle arrays (like date objects)
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
      const firstItem = value[0] as Record<string, unknown>;
      if ('date' in firstItem && typeof firstItem.date === 'string') {
        return firstItem.date;
      }
    }
    return value.map((v) => String(v)).join(', ');
  }

  // Handle objects
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if ('date' in obj && typeof obj.date === 'string') return obj.date;
    if ('name' in obj && typeof obj.name === 'string') return obj.name;
    return JSON.stringify(value);
  }

  // Handle strings - capitalize first letter
  if (typeof value === 'string') {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  // Handle other types
  return String(value);
}
