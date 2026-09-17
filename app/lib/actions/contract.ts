import axios from 'axios';
import { ExternalServiceError, SystemError, NotFoundError } from '@/lib/errors';
import logger from '@/utils/pino';
import { stringifyCsv } from '@/lib/csv-export/stringify';
import { assertCsvExportAllowed } from '@/lib/csv-export/assert-export';
import { orderExportColumns } from '@/lib/csv-export/order-columns';
import { addYears, parseISO, format, isValid } from 'date-fns';
import { getEffectiveDateFormat } from '@/data/users';
import { formatDate } from '@/lib/date-format';
import {
  contractOwners,
  ownerGroupNames,
  ownerSponsorNames,
} from '@/lib/v2/owners/embed';
import type { RawContractOwnerRow } from '@/lib/v2/owners/types';
import { sanitizeOrderNumber } from '@/lib/v2/contracts/orderNumber';
import { escapeSpreadsheetCell } from '@/lib/csv-export/escape';
import {
  fetchContracts,
  fetchContractsById,
} from '@/app/lib/contracts/actions';
import _ from 'lodash';
import { contractStatuses, isInvoiceType } from '@/app/lib/constants';
import { getContractUsers } from '@/data/superuser/contracts';
import { getProductsByYear } from '../utils';
import { getProductYearLabel } from '../budget';
import { generatePriceHistory, extractBudgetFromPriceHistory } from '../budget';
import ExcelJS from 'exceljs';

import { Database } from '@/database.types';

type Contract = Database['public']['Tables']['contracts']['Row'] & {
  vendor_products_details: Array<{
    product_id: number;
    year?: number;
    fees?: number;
    convertedFees?: number;
    vendor_products?: {
      name: string;
      id: number;
      data_delivery_types?: { id: number; name: string };
    };
  }>;
  vendors?: { name: string };
  contract_types?: {
    name: string;
  };
  term_start_date?: Array<{ date: string }>;
  term_end_date?: Array<{ date: string }>;
  cancel_date?: Array<{ date: string }>;
  tags?: Array<{ name: string }>;
  contract_tags?: Array<{ user_tags: { name: string } }>;
  contract_data_delivery_types?: Array<{
    id: number;
    data_delivery_types: { id: number; name: string };
  }>;
  contract_owners?: RawContractOwnerRow[] | null;
  [key: string]: any;
};

export const uploadFile = async (file: any, fileName: any) => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileName', fileName);
    const response = await axios.post('/api/contract/upload', formData);
    return response.data;
  } catch (error: any) {
    logger.error(error, 'Error uploading file');
    let errorMessage = error.message;
    if (error.response && _.has(error, 'response.data')) {
      errorMessage = _.get(error, 'response.data.error') || errorMessage;
    }
    throw new ExternalServiceError('FileUpload', errorMessage, error);
  }
};

const LIST_VIEW_ID_TO_EXPORT_KEY: Record<string, string> = {
  vendor: 'vendor',
  orderNumber: 'order_number',
  product: 'product_name',
  type: 'contract_type',
  renewalType: 'renewal_type',
  termStartDate: 'term_start_date',
  cancelByDate: 'cancel_date',
  termEndDate: 'term_end_date',
  executionDate: 'execution_date',
  currentBudget: 'product_fee',
  tags: 'tags',
  businessSponsor: 'business_sponsor',
  businessGroup: 'business_group',
};

interface DateField {
  date: string;
}

interface Product {
  year?: string;
  fees?: number;
  vendor_products?: {
    name: string;
  };
  product_id?: string | number;
  originalFees?: number;
}

export async function exportCSV({
  id,
  range,
  fiscalYearStartMonth = 1,
  reportType: _reportType,
  contracts: providedContracts,
  fieldsToInclude,
  columnOrder,
  format: outputFormat = 'csv',
}: {
  id?: number;
  range?: number;
  fiscalYearStartMonth: number;
  reportType?: string;
  contracts?: Contract[];
  fieldsToInclude?: string[];
  columnOrder?: string[];
  format?: 'csv' | 'xlsx';
}) {
  await assertCsvExportAllowed('cpm');
  const dateFormat = await getEffectiveDateFormat();
  try {
    // Get contracts data based on passed parameters
    let contracts: Contract[] = [];
    let users: { name: string; email: string }[] = [];

    // If contracts were directly provided, use those
    if (providedContracts && providedContracts.length > 0) {
      contracts = providedContracts;
    }
    // Otherwise if ID was provided, fetch that specific contract
    else if (id) {
      const fetchedContracts = await fetchContractsById({ ids: [id] });
      if (!fetchedContracts || fetchedContracts.length === 0) {
        return null;
      }
      const contract = fetchedContracts[0];
      if (contract) {
        contracts = [contract as unknown as Contract];
      }
      const _users = await getContractUsers(id);
      users =
        _users?.map((user) => ({
          name: user.name,
          email: user.email ?? '',
        })) || [];
    }
    // Otherwise fetch contracts based on range/filters
    else {
      const fetchedContracts = await fetchContracts({
        range: range || 0,
        contractFields: [],
        contractStatus: 4,
        hideFailed: true,
        status: 'active',
      });
      contracts = fetchedContracts as unknown as Contract[];
    }

    // Invoices label their dates differently from other contract types, matching
    // the invoice views in the app. Only the rows that survive the status filter
    // below reach the CSV, so the headers follow those rather than every fetched
    // contract.
    const exportedContracts = contracts.filter(
      (contract) => contract.status_id === contractStatuses.published,
    );
    const isInvoiceExport =
      exportedContracts.length > 0 &&
      exportedContracts.every((contract) => isInvoiceType(contract.type_id));

    const columnMapping = {
      id: 'Document ID',
      vendor: 'Vendor',
      order_number: 'Contract No.',
      contract_type: 'Contract Type',
      unconfirmed: 'Unconfirmed?',
      product_start_date: 'Product Start Date',
      product_name: 'Product Name',
      product_code: 'Product Code',
      related_contracts: 'Related Contracts',
      number_of_users: 'Number of Users',
      fiscal_year: 'Fiscal Year',
      product_fee: 'Current Spend',
      execution_date: isInvoiceExport ? 'Invoice Date' : 'Execution Date',
      term_start_date: isInvoiceExport
        ? 'Billing Period Start Date'
        : 'Term Start Date',
      term_end_date: isInvoiceExport
        ? 'Billing Period End Date'
        : 'Term End Date',
      cancel_date: 'Cancel By Date',
      summary: 'Summary',
      renewal_type: 'Renewal Type',
      multi_year: 'Multi-Year Contract',
      subscription_term: 'Subscription Term',
      billing_frequency: 'Billing Frequency',
      currency: 'Currency',
      annual_increase: 'Annual Increase',
      payment_terms: 'Payment Terms',
      renewal_period: 'Renewal Period',
      cancellation_process: 'Cancellation Terms',
      end_users: 'End Users',
      internal_external_users: 'User Type',
      market_data_types: 'Market Data Types',
      data_delivery_types: 'Data Delivery Method',
      exclusivity_terms: 'Exclusivity Terms',
      distribution_rights: 'Distribution Rights',
      geo_restrictions: 'Geo Restrictions',
      derivative_works: 'Derivative Works',
      activities: 'Activities',
      marketing_rights: 'Marketing Rights',
      suspension_of_service: 'Suspension of Service',
      data_disposal_tnc: 'Data Disposal Terms',
      audit_requirements: 'Audit Requirements',
      business_sponsor: 'Business Sponsor',
      business_group: 'Business Group',
      business_justification: 'Business Justification',
      business_order: 'Business Order Code',
      tags: 'Tags',
      asset_classes: 'Asset Classes',
      // NDA-specific fields
      purpose: 'Purpose',
      mutual_nda: 'Mutual NDA',
      confidential_information: 'Confidential Information',
      permitted_use: 'Permitted Use',
      term_termination: 'Term/Termination',
      non_use_non_disclosure: 'Non-Use/Non-Disclosure',
      maintenance_of_confidentiality: 'Maintenance of Confidentiality',
      no_obligation: 'No Obligation',
      no_license_ownership: 'No License/Ownership',
      exclusions_exceptions: 'Exclusions/Exceptions',
      non_solicitation_of_employees: 'Non-Solicitation of Employees',
      remedies: 'Remedies',
      no_warranty: 'No Warranty',
      disclosure_required_by_law: 'Disclosure Required By Law',
      miscellaneous: 'Miscellaneous',
      extended_confidentiality_period: 'Extended Confidentiality Term',
      // Additional contract fields
      ai_training_restrictions: 'AI Training Restrictions',
      service_level_agreements: 'Service Level Agreements',
      cost_mitigation: 'Incident Related Cost Mitigation',
      security_awareness: 'Security Awareness and Training',
      amended_clauses: 'Amended Clauses',
    };

    // Filter columns based on fieldsToInclude if provided
    let filteredColumnMapping = columnMapping;
    if (columnOrder && columnOrder.length > 0) {
      const orderedKeys = orderExportColumns({
        visibleIds: columnOrder,
        idToKey: LIST_VIEW_ID_TO_EXPORT_KEY,
        allKeys: Object.keys(columnMapping),
        leadingKeys: ['id'],
      });

      filteredColumnMapping = orderedKeys.reduce(
        (acc, key) => {
          acc[key as keyof typeof columnMapping] =
            columnMapping[key as keyof typeof columnMapping];
          return acc;
        },
        {} as typeof columnMapping,
      );
    } else if (fieldsToInclude && fieldsToInclude.length > 0) {
      // Always include basic essential fields for export structure
      const basicEssentialFields = ['id'];

      // Use the provided fieldsToInclude which already contains the appropriate fields
      // for the contract type (including product fields if relevant)
      const fieldsToIncludeSet = new Set([
        ...basicEssentialFields,
        ...fieldsToInclude,
      ]);

      filteredColumnMapping = Object.keys(columnMapping).reduce(
        (acc, key) => {
          if (fieldsToIncludeSet.has(key)) {
            acc[key as keyof typeof columnMapping] =
              columnMapping[key as keyof typeof columnMapping];
          }
          return acc;
        },
        {} as typeof columnMapping,
      );
    }

    const fields = Object.values(filteredColumnMapping);

    // Collect all rows in an array for flexible output
    const allRows: any[][] = [];
    allRows.push(fields); // Add header row

    // Sort contracts by end date
    const sortedContracts = contracts.sort((a, b) => {
      const aEndDate = safeParse(a.term_end_date?.[0]?.date);
      const bEndDate = safeParse(b.term_end_date?.[0]?.date);
      return (
        (aEndDate || new Date(0)).getTime() -
        (bEndDate || new Date(0)).getTime()
      );
    });

    for (const contract of sortedContracts) {
      if (contract.status_id !== contractStatuses.published) continue;

      // Generate price history to get accurate pricing with compounded fees
      let productsByYear: Record<
        string,
        Array<
          Product & {
            product_id?: string | number;
            vendor_products?: {
              name: string;
              id?: string | number;
              data_delivery_types?: { id: number; name: string };
            };
            fees?: number;
            originalFees?: number;
            renewalCount?: number;
          }
        >
      > = {};

      try {
        // Generate price history with accurate renewal calculations
        const priceHistory = generatePriceHistory(
          contract,
          fiscalYearStartMonth,
          'minimal',
        );

        // Extract budget data including current products from price history
        const { currentProducts } = extractBudgetFromPriceHistory(priceHistory);

        // Group products by yearWithinTerm, just like in ProductsLicensed component
        if (currentProducts && currentProducts.length > 0) {
          // Initialize empty object for our grouped products
          const groupedProducts: Record<string, any[]> = {};

          // Process each product with period info
          currentProducts.forEach((product) => {
            // Skip products without period info
            if (!product.periodInfo) return;

            const yearKey = product.periodInfo.yearWithinTerm.toString();

            // Initialize array for this year if it doesn't exist
            if (!groupedProducts[yearKey]) {
              groupedProducts[yearKey] = [];
            }

            // Check if this product is already in the array for this year
            const exists = groupedProducts[yearKey].some(
              (p) =>
                p.product_id === product.product_id &&
                p.periodInfo?.termIndex === product.periodInfo?.termIndex,
            );

            if (!exists) {
              // Ensure vendor_products is properly formatted
              const vendorProducts = product.vendor_products
                ? {
                    name: product.vendor_products.name || 'Unknown Product',
                    id: product.vendor_products.id || product.product_id,
                    product_code: product.vendor_products.product_code ?? null,
                    data_delivery_types:
                      product.vendor_products.data_delivery_types || undefined,
                  }
                : {
                    name: 'Unknown Product',
                    id: product.product_id,
                    product_code: null,
                    data_delivery_types: undefined,
                  };

              // Add formatted product to the correct year group
              groupedProducts[yearKey].push({
                product_id: product.product_id,
                vendor_products: vendorProducts,
                fees: Number(product.fees) || 0,
                originalFees: Number(product.originalFees || product.fees) || 0,
                year: yearKey, // Use yearWithinTerm as the year value
                renewalCount:
                  product.periodInfo.termIndex > 0
                    ? product.periodInfo.termIndex
                    : 0,
                periodStartDate:
                  product.startDate ||
                  priceHistory.currentTermStartDate ||
                  contract.term_start_date?.[0]?.date,
                periodInfo: product.periodInfo,
              });
            }
          });

          // Assign the grouped products to productsByYear
          productsByYear = groupedProducts;
        }

        // If still empty, create a default entry
        if (Object.keys(productsByYear).length === 0) {
          productsByYear = { '1': [{}] };
        }
      } catch (error) {
        console.error(
          'Error processing products for contract:',
          contract.id,
          error,
        );
        // Fallback to ensure the contract is included with at least one row
        productsByYear = { '1': [{}] };
      }

      // Generate rows for each product with its fiscal year
      Object.entries(productsByYear).forEach(([year, yearProducts]) => {
        let fiscalYear = '';
        try {
          const yearInt = parseInt(year);
          if (!isNaN(yearInt)) {
            fiscalYear = getProductYearLabel(
              yearInt,
              contract.term_start_date?.[0]?.date || '',
              fiscalYearStartMonth,
            );
          }
        } catch (e) {
          console.error(
            `Error calculating fiscal year for contract ${contract.id}:`,
            e,
          );
        }

        yearProducts.forEach((product: any) => {
          let row = Object.keys(filteredColumnMapping).map((dbField) => {
            switch (dbField) {
              case 'vendor':
                return contract.vendors?.name || '';
              case 'order_number':
                return escapeSpreadsheetCell(
                  sanitizeOrderNumber(
                    (contract as any).metadata?.lineage?.order_number,
                  ) ?? '',
                );
              case 'contract_type':
                return contract.contract_types?.name || '';
              case 'unconfirmed':
                return contract.status === 'unconfirmed' ? 'Yes' : '';
              case 'product_name':
                return product.vendor_products?.name || '';
              case 'product_code':
                return product.vendor_products?.product_code || '';
              case 'related_contracts':
                // Combine parent and child IDs into comma-separated string
                if (contract.related_contracts) {
                  const parentIds = contract.related_contracts.parent_ids || [];
                  const childIds = contract.related_contracts.child_ids || [];
                  return [...parentIds, ...childIds].join(', ');
                }
                return '';
              case 'fiscal_year':
                return fiscalYear;
              case 'product_fee':
                if (product.fees === 0) return '0';
                if (product.fees) {
                  const numFees = Number(product.fees);
                  return isNaN(numFees) ? product.fees : numFees.toFixed(2);
                }
                return '';
              case 'product_start_date':
                try {
                  // Use period start date if available
                  if (product.periodStartDate) {
                    return formatDate(product.periodStartDate, dateFormat, '');
                  }

                  // For years after the first, calculate the start date based on term start + years
                  if (year && parseInt(year) > 1) {
                    const termStartDate = safeParse(
                      contract.term_start_date?.[0]?.date,
                    );
                    if (termStartDate) {
                      const yearOffset = parseInt(year) - 1; // Year 1 starts at term start, Year 2 starts 1 year later, etc.
                      const yearStartDate = addYears(termStartDate, yearOffset);
                      return format(yearStartDate, dateFormat);
                    }
                  }

                  // Otherwise fall back to the contract's term start date
                  const termStartDate = safeParse(
                    contract.term_start_date?.[0]?.date,
                  );
                  return termStartDate ? format(termStartDate, dateFormat) : '';
                } catch (e) {
                  console.error(
                    `Error formatting product_start_date for contract ${contract.id}:`,
                    e,
                  );
                  return '';
                }
              case 'term_start_date':
                try {
                  const termStartDate = safeParse(
                    contract.term_start_date?.[0]?.date,
                  );
                  return termStartDate ? format(termStartDate, dateFormat) : '';
                } catch (e) {
                  console.error(
                    `Error formatting term_start_date for contract ${contract.id}:`,
                    e,
                  );
                  return '';
                }
              case 'term_end_date':
                try {
                  const termEndDate = safeParse(
                    contract.term_end_date?.[0]?.date,
                  );
                  return termEndDate ? format(termEndDate, dateFormat) : '';
                } catch (e) {
                  console.error(
                    `Error formatting term_end_date for contract ${contract.id}:`,
                    e,
                  );
                  return '';
                }
              case 'execution_date':
                if (!contract.execution_date) return '';
                try {
                  const parsedDate = parseISO(contract.execution_date);
                  return isValid(parsedDate)
                    ? format(parsedDate, dateFormat)
                    : '';
                } catch (e) {
                  console.error(
                    `Invalid execution_date for contract ${contract.id}:`,
                    contract.execution_date,
                  );
                  return '';
                }
              case 'cancel_date':
              case 'cancel_by_date':
                try {
                  const cancelByDate = safeParse(
                    contract.cancel_date?.[0]?.date,
                  );
                  return cancelByDate ? format(cancelByDate, dateFormat) : '';
                } catch (e) {
                  console.error(
                    `Error formatting cancel_date for contract ${contract.id}:`,
                    e,
                  );
                  return '';
                }
              case 'multi_year':
                return contract.multi_year ? 'Yes' : 'No';
              case 'business_sponsor':
                return ownerSponsorNames(contractOwners(contract)).join(', ');
              case 'business_group':
                return ownerGroupNames(contractOwners(contract)).join(', ');
              case 'activities':
              case 'derivative_works':
              case 'end_users':
              case 'market_data_types':
              case 'internal_external_users':
              case 'data_disposal_tnc':
              case 'audit_requirements':
                return contract[dbField] || '';
              case 'data_delivery_types':
                // Handle junction table format - contract.contract_data_delivery_types
                if (
                  product.vendor_products &&
                  product.vendor_products.data_delivery_types
                ) {
                  return product.vendor_products.data_delivery_types.name;
                }

                if (
                  contract.contract_data_delivery_types &&
                  Array.isArray(contract.contract_data_delivery_types)
                ) {
                  return contract.contract_data_delivery_types
                    .filter(
                      (item) =>
                        item.data_delivery_types &&
                        item.data_delivery_types.name,
                    )
                    .map((item) => item.data_delivery_types.name)
                    .join(', ');
                }
                return '';
              case 'number_of_users':
                // Check if current product has a specific number of users
                if (
                  contract.vendor_products_users &&
                  Array.isArray(contract.vendor_products_users)
                ) {
                  // Find product-specific number of users entry
                  const productSpecificEntry =
                    contract.vendor_products_users.find(
                      (pu) => pu.product_id === product.product_id,
                    );

                  if (productSpecificEntry?.number_of_users) {
                    return String(productSpecificEntry.number_of_users);
                  }

                  // If no product-specific entry, check for general entry (null product_id)
                  const generalEntry = contract.vendor_products_users.find(
                    (pu) => pu.product_id === null,
                  );

                  if (generalEntry?.number_of_users) {
                    return String(generalEntry.number_of_users);
                  }
                }

                // Fall back to contract-level number_of_users if nothing found in vendor_products_users
                return contract.number_of_users || '';
              case 'currency':
                return contract.currency?.toUpperCase() || '';
              case 'annual_increase':
                return contract.annual_increase
                  ? Number(contract.annual_increase) / 100
                  : '';
              case 'tags':
                // Handle different tag formats
                // First try contract.tags format
                if (contract.tags && Array.isArray(contract.tags)) {
                  return contract.tags
                    .map((tag) => tag.name)
                    .filter(Boolean)
                    .join(', ');
                }
                // Then try contract.contract_tags format - this is the format from fetchContractById
                else if (
                  contract.contract_tags &&
                  Array.isArray(contract.contract_tags)
                ) {
                  return contract.contract_tags
                    .filter((tag) => tag.user_tags && tag.user_tags.name)
                    .map((tag) => tag.user_tags.name)
                    .join(', ');
                }
                return '';
              case 'asset_classes':
                // Handle asset classes - array of objects with name property
                if (
                  contract.asset_classes &&
                  Array.isArray(contract.asset_classes)
                ) {
                  return contract.asset_classes
                    .map((assetClass) => assetClass.name)
                    .filter(Boolean)
                    .join(', ');
                }
                return '';
              case 'purpose':
              case 'mutual_nda':
              case 'confidential_information':
              case 'permitted_use':
              case 'term_termination':
              case 'non_use_non_disclosure':
              case 'maintenance_of_confidentiality':
              case 'no_obligation':
              case 'no_license_ownership':
              case 'exclusions_exceptions':
              case 'non_solicitation_of_employees':
              case 'remedies':
              case 'no_warranty':
              case 'disclosure_required_by_law':
              case 'miscellaneous':
                // Handle NDA fields from other_attributes.nda_fields
                const ndaFields =
                  contract.other_attributes &&
                  typeof contract.other_attributes === 'object'
                    ? (contract.other_attributes as any)?.nda_fields
                    : null;
                return ndaFields?.[dbField] || '';
              case 'extended_confidentiality_period':
                // Special handling for extended confidentiality period
                const ndaFieldsForECP =
                  contract.other_attributes &&
                  typeof contract.other_attributes === 'object'
                    ? (contract.other_attributes as any)?.nda_fields
                    : null;
                const extendedPeriod =
                  ndaFieldsForECP?.extended_confidentiality_period;
                if (!extendedPeriod) return '';
                const months = Number(extendedPeriod);
                const termEndDate = contract.term_end_date?.[0]?.date;

                if (termEndDate && !isNaN(months)) {
                  try {
                    const { addMonths, parseISO, format } = require('date-fns');
                    const endDate = addMonths(parseISO(termEndDate), months);
                    return format(endDate, dateFormat);
                  } catch (e) {
                    return !isNaN(months) ? `${months} months` : '';
                  }
                }
                return !isNaN(months) ? `${months} months` : '';
              case 'amended_clauses':
                const amendedClauses =
                  contract.other_attributes &&
                  typeof contract.other_attributes === 'object'
                    ? (contract.other_attributes as any)?.amended_clauses
                    : null;
                return amendedClauses || '';
              case 'ai_training_restrictions':
              case 'service_level_agreements':
              case 'cost_mitigation':
              case 'security_awareness':
                // These are direct contract fields
                return contract[dbField] || '';
              default:
                return contract[dbField] || '';
            }
          });

          // Replace empty string with N/A
          row = row.map((value) => (value === '' ? 'N/A' : value));

          // Add row to our collection
          allRows.push(row);
        });

        // Add sales tax row for invoice contracts if sales tax exists for this year
        if (isInvoiceType(contract.type_id)) {
          const invoiceFields =
            contract.other_attributes &&
            typeof contract.other_attributes === 'object'
              ? (contract.other_attributes as any)?.invoice_fields
              : null;
          const salesTaxDetails = invoiceFields?.sales_tax_details || [];
          const salesTaxForYear = salesTaxDetails.find(
            (tax: any) => tax.year === parseInt(year),
          );

          if (salesTaxForYear && parseFloat(salesTaxForYear.sales_tax) > 0) {
            const salesTaxAmount = parseFloat(salesTaxForYear.sales_tax);

            // Create sales tax row with mostly empty fields
            let salesTaxRow = Object.keys(filteredColumnMapping).map(
              (dbField) => {
                switch (dbField) {
                  case 'id':
                    return contract.id;
                  case 'product_name':
                    return 'Sales Tax';
                  case 'product_code':
                    return '';
                  case 'product_fee':
                    return salesTaxAmount.toFixed(2);
                  case 'fiscal_year':
                    // Use the same fiscal year calculation as regular products
                    try {
                      const yearInt = parseInt(year);
                      if (!isNaN(yearInt)) {
                        return getProductYearLabel(
                          yearInt,
                          contract.term_start_date?.[0]?.date || '',
                          fiscalYearStartMonth,
                        );
                      }
                    } catch (e) {
                      logger.error(
                        { error: e, contractId: contract.id, year },
                        'Error calculating fiscal year for sales tax',
                      );
                    }
                    return '';
                  case 'product_start_date':
                    // Use the same product start date calculation as regular products
                    try {
                      const yearInt = parseInt(year);
                      if (!isNaN(yearInt) && yearInt > 1) {
                        const termStartDate = safeParse(
                          contract.term_start_date?.[0]?.date,
                        );
                        if (termStartDate) {
                          const yearOffset = yearInt - 1;
                          const yearStartDate = addYears(
                            termStartDate,
                            yearOffset,
                          );
                          return format(yearStartDate, dateFormat);
                        }
                      }
                      // For year 1 or if calculation fails, use term start date
                      const termStartDate = safeParse(
                        contract.term_start_date?.[0]?.date,
                      );
                      return termStartDate
                        ? format(termStartDate, dateFormat)
                        : '';
                    } catch (e) {
                      return '';
                    }
                  default:
                    return ''; // All other fields are empty for sales tax rows
                }
              },
            );

            // Add sales tax row
            allRows.push(salesTaxRow);
          }
        }
      });
    }

    // Add active users section if requested
    if (users.length) {
      allRows.push([]); // Empty row
      allRows.push(['Active Users']);
      allRows.push(['User Name', 'User Email']);
      users.forEach((user: { name: string; email: string }) => {
        allRows.push([user.name || 'N/A', user.email || 'N/A']);
      });
    }

    // Generate output based on format
    if (outputFormat === 'xlsx') {
      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Contracts');

      // Add all rows
      allRows.forEach((row, index) => {
        worksheet.addRow(row);

        // Style the first row (header)
        if (index === 0) {
          worksheet.getRow(index + 1).font = { bold: true };
          worksheet.getRow(index + 1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' },
          };
        }

        // Style "Active Users" section header if present
        if (row[0] === 'Active Users') {
          worksheet.getRow(index + 1).font = { bold: true };
        }
      });

      // Auto-fit columns
      worksheet.columns.forEach((column) => {
        if (column && column.values && column.eachCell) {
          let maxLength = 0;
          column.eachCell({ includeEmpty: true }, (cell) => {
            const columnLength = cell.value ? String(cell.value).length : 10;
            if (columnLength > maxLength) {
              maxLength = columnLength;
            }
          });
          column.width = Math.min(maxLength + 2, 50); // Cap at 50
        }
      });

      // Generate buffer and convert to Blob
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      return blob;
    } else {
      // Generate CSV content
      const csvContent = stringifyCsv(allRows, {
        quoted: true,
        quoted_empty: true,
        quoted_string: true,
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      return blob;
    }
  } catch (error) {
    logger.error(error, 'Failed to generate CSV');
    throw new SystemError(
      'Failed to generate CSV',
      'CSV_GENERATION_ERROR',
      error as Error,
    );
  }
}

// Generic table export function
export async function exportTableCSV({
  data,
  headers,
  filename,
  title,
  metadata = [],
  multiValueFields = [],
  emptyPlaceholder = 'N/A',
}: {
  data: Record<string, any>[];
  headers: { key: string; label: string }[];
  filename: string;
  title?: string;
  metadata?: { label: string; value: string }[];
  multiValueFields?: { label: string; values: string[] }[];
  emptyPlaceholder?: string;
}) {
  try {
    const rows: any[] = [];

    // Add title if provided
    if (title) {
      rows.push([title]);
      rows.push([]); // Empty row
    }

    // Add metadata rows
    metadata.forEach((meta) => {
      rows.push([meta.label, meta.value]);
    });

    // Add multi-value fields (like products list)
    multiValueFields.forEach((field) => {
      if (field.values.length > 0) {
        rows.push([field.label, field.values[0]]);

        // Add remaining values with empty first cell
        for (let i = 1; i < field.values.length; i++) {
          rows.push(['', field.values[i]]);
        }
      }
    });

    if (metadata.length > 0 || multiValueFields.length > 0) {
      rows.push([]); // Empty row after metadata
    }

    // Add column headers
    rows.push(headers.map((h) => h.label));

    // Add data rows
    data.forEach((item) => {
      rows.push(
        headers.map((h) => {
          const value = item[h.key];
          return value === '' || value == null ? emptyPlaceholder : value;
        }),
      );
    });

    const csvContent = stringifyCsv(rows, {
      header: false,
      quoted: true,
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    return blob;
  } catch (error) {
    logger.error(error, 'Failed to generate CSV');
    throw new SystemError(
      'Failed to generate CSV',
      'CSV_GENERATION_ERROR',
      error as Error,
    );
  }
}

export async function exportActiveUsersCSV({
  id,
  users,
}: {
  id: number;
  users: {
    name: string;
    email: string;
    product?: string;
    employee_id?: string;
    region?: string;
    country?: string;
    division?: string;
    department?: string;
    cost_center?: string;
    entity?: string;
    business_unit?: string;
    team?: string;
    business_group?: string;
    start_date?: string;
    leave_date?: string;
  }[];
}) {
  try {
    const contracts = await fetchContractsById({ ids: [id] });
    if (!contracts || contracts.length === 0) {
      return null;
    }
    const contract = contracts[0];
    if (!contract) {
      throw new NotFoundError('Contract');
    }

    const vendorName = contract.vendors?.name || 'N/A';
    const contractType = contract.contract_types?.name || 'N/A';

    // Extract product names (preserve existing logic)
    const productNames = contract.vendor_products_details
      ?.map(
        (detail: { vendor_products: { name: string } }) =>
          detail.vendor_products?.name,
      )
      .filter((name: string) => name) || ['N/A'];

    const dateFormat = await getEffectiveDateFormat();
    const formattedUsers = users.map((user) => ({
      ...user,
      start_date: user.start_date
        ? formatDate(user.start_date, dateFormat, '')
        : user.start_date,
      leave_date: user.leave_date
        ? formatDate(user.leave_date, dateFormat, '')
        : user.leave_date,
    }));

    return exportTableCSV({
      data: formattedUsers,
      headers: [
        { key: 'name', label: 'User Name' },
        { key: 'email', label: 'User Email' },
        { key: 'product', label: 'Product' },
        { key: 'employee_id', label: 'Employee ID' },
        { key: 'region', label: 'Region' },
        { key: 'country', label: 'Country' },
        { key: 'division', label: 'Division' },
        { key: 'department', label: 'Department' },
        { key: 'cost_center', label: 'Cost Center' },
        { key: 'entity', label: 'Entity' },
        { key: 'business_unit', label: 'Business Unit' },
        { key: 'team', label: 'Team' },
        { key: 'business_group', label: 'Business Group' },
        { key: 'start_date', label: 'Start Date' },
        { key: 'leave_date', label: 'Leave Date' },
      ],
      filename: `contract_${id}_active_users.csv`,
      title: 'Active Users Report',
      metadata: [
        { label: 'Vendor Name', value: vendorName },
        { label: 'Contract Type', value: contractType },
      ],
      multiValueFields: [{ label: 'Products', values: productNames }],
    });
  } catch (error) {
    logger.error(error, 'Failed to generate CSV');
    throw new SystemError(
      'Failed to generate CSV',
      'CSV_GENERATION_ERROR',
      error as Error,
    );
  }
}

// Helper functions
function safeParse(dateString: string | null | undefined): Date | null {
  try {
    if (!dateString) return null;

    // Handle invalid date strings
    if (dateString === 'Invalid Date' || dateString === '0000-00-00')
      return null;

    // Try to parse the date
    const parsed = parseISO(dateString);

    // Check if the date is valid
    if (!isValid(parsed)) return null;

    // Check if the year is reasonable (avoid dates like year 0001)
    if (parsed.getFullYear() < 1900 || parsed.getFullYear() > 2100) {
      console.warn(`Suspicious date year for: ${dateString}`);
      return null;
    }

    return parsed;
  } catch (e) {
    console.error('Error parsing date:', dateString, e);
    return null;
  }
}

function getProductStartDate(
  contract: Contract,
  product: Product,
): Date | null {
  try {
    const termStartDate = safeParse(contract.term_start_date?.[0]?.date);
    if (!termStartDate) return null;

    // Get product year with a fallback and make sure it's a valid number
    let productYear: number;
    try {
      productYear = parseInt(product.year?.toString() || '1');
      if (isNaN(productYear) || productYear < 1 || productYear > 100) {
        productYear = 1; // Fallback to year 1 if invalid
      }
    } catch (e) {
      productYear = 1;
    }

    // Add years safely
    try {
      return addYears(termStartDate, productYear - 1);
    } catch (e) {
      console.error('Error calculating product start date:', e);
      return null;
    }
  } catch (e) {
    console.error('Error in getProductStartDate:', e);
    return null;
  }
}
