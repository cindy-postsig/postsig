import {
  baseContractTypeId,
  contractTypes,
  contractStatuses,
  AI_FAILED,
  AI_SUCCESS,
  isInvoiceType,
} from '@/app/lib/constants';
import { prompts, fields } from '@postsig/toolkit';
import { getDurationSeconds } from '@/app/lib/utils';
import {
  getContractSpecifics,
  getContractBasics,
  getAdditionalData,
  getVendorId,
  saveContractColumns,
  saveAiExtractionStatus,
  saveToDb,
  updateAiExtractionJson,
  setContractOrderNumber,
  mergeContractLineage,
} from '@/app/lib/actions/openai';
import { getContractBasicsWithGoogle } from '@/lib/google';
import {
  fetchContract,
  getContractById,
  getContractDocument,
} from '@/data/superuser/contracts';
import _ from 'lodash';
import { ModelProvider } from '@/constants/types';
import {
  saveVendorProductDetail,
  searchVendorProducts,
  createVendorProduct,
  expandVendorLineageIds,
  removeVendorProductDetail,
} from '@/data/superuser/vendors';
import {
  searchAssetClasses,
  searchSubAssetClasses,
  saveAssetClass,
  removeAssetClasses,
  searchDataDeliveryTypes,
  createDataDeliveryType,
  saveContractDataDeliveryType,
  removeContractDataDeliveryTypes,
} from '@/app/lib/actions/supabase_service';
import {
  contractLineageStrategies,
  ContractLineageStrategyParams,
} from './contract-lineage-strategies';
import { NonRetriableError } from 'inngest';
import { ContractLineageInvariantError } from '@/lib/errors';
import { parseProductsList, transformAiExtractionData } from '@/lib/utils';
import { toCompareKey } from '@/lib/name-matching';
import {
  replaceContractProductCredits,
  type ContractProductCreditInput,
} from '@/data/superuser/contractProductCredits';
import { getFieldAnalysis } from '@/lib/fieldAnalysis';
import { logError } from '@/utils/log-sanitization';
import { logAlert } from '@/utils/logging/alert';
import { createPromptResolver } from '@/app/lib/prompt-resolver';
import { MODULE_IDS } from '@/lib/settings/config';
import {
  exchangeAgreementProductsListQuery,
  exchangeAgreementProductsListSchema,
  sanitizeExchangeAgreementProduct,
} from '@/constants/prompts/exchangeAgreementSchemas';
import { crossCheckProductCode } from '@/lib/exchange-agreement/codeAxes';
import { createPendingProductLineageEvent } from '@/data/superuser/productLineageEvents';
import { Json } from '@/database.types';

const {
  contractTypes: { getContractFields, contractTypeIdToFormTypeMap },
} = fields;

interface ContractProcessingResult {
  data?: any;
  durationSeconds: number;
  nTotalTokens?: number;
  nPromptTokens?: number;
  nCompletionTokens?: number;
}

export async function processContractSpecs({
  filePath,
  fileId,
  contractId,
  columns,
  userId,
  logger,
  organizationId,
  processor,
}: {
  filePath: string;
  fileId: string;
  contractId: number;
  columns: string[];
  userId: string;
  logger: any;
  organizationId: string;
  processor: ModelProvider;
}): Promise<ContractProcessingResult> {
  try {
    const startTime = performance.now();
    const { data, usage } = await getContractSpecifics(
      filePath,
      fileId,
      columns,
      processor,
    );
    if (data && data.contract_type) {
      if (
        data.contract_type &&
        typeof data.contract_type === 'string' &&
        data.contract_type in contractTypes
      ) {
        data.type_id =
          contractTypes[data.contract_type as keyof typeof contractTypes];
      } else {
        data.type_id = contractTypes.Other;
      }
      delete data.contract_type;
    } else {
      data.type_id = contractTypes.Other;
      delete data.contract_type;
    }
    if (data && data.vendor_name && data.vendor_name !== 'NO_DATA_FOUND') {
      const vendorId = await getVendorId(
        data.vendor_name,
        data?.vendor_location,
        organizationId,
      );
      data.vendor_id = vendorId;
      delete data.vendor_name;
      delete data.vendor_location;
    }
    if (data && data.contract_summary) {
      data.summary = data.contract_summary;
      delete data.contract_summary;
    }
    if (data && data.products_list) {
      data.products_fees = [
        {
          summary: { products_list: data.products_list },
        },
      ];
      delete data.products_list;
    }
    if (data) {
      data.status_id = contractStatuses.new;
    }
    const endTime = performance.now();
    const durationSeconds = getDurationSeconds(startTime, endTime);
    await saveContractColumns(data, contractId);
    return {
      data,
      durationSeconds,
      nTotalTokens: usage?.total_tokens,
      nPromptTokens: usage?.prompt_tokens,
      nCompletionTokens: usage?.completion_tokens,
    };
  } catch (error) {
    logError(logger, error, {
      userId,
      contractId,
      fileId,
    });
    throw error;
  }
}

export async function processContractBasics({
  filePath,
  fileId,
  contractId,
  userId,
  logger,
  organizationId,
  processor = ModelProvider.google,
}: {
  filePath: string;
  fileId: string;
  contractId: number;
  userId: string;
  logger: any;
  organizationId: string;
  processor: ModelProvider;
}): Promise<ContractProcessingResult> {
  try {
    const startTime = performance.now();
    let data;
    let usage;
    if (processor === ModelProvider.google) {
      const { data: googleData, usage: googleUsage } =
        await getContractBasicsWithGoogle(filePath, null, true);
      data = googleData;
      usage = googleUsage;
    } else {
      const { data: openaiData, usage: openaiUsage } = await getContractBasics(
        fileId,
        null,
        true,
      );
      data = openaiData;
      usage = openaiUsage;
    }
    const endTime = performance.now();
    const durationSeconds = getDurationSeconds(startTime, endTime);
    await saveToDb(data, contractId);
    return {
      durationSeconds,
      nTotalTokens: usage?.total_tokens,
      nPromptTokens: usage?.prompt_tokens,
      nCompletionTokens: usage?.completion_tokens,
    };
  } catch (error) {
    await saveAiExtractionStatus(AI_FAILED, contractId);
    logError(logger, error, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      details: (error as { details?: any })?.details,
      userId,
      organizationId,
      contractId,
      fileId,
    });
    throw error;
  }
}

/**
 * The prompt to fall back on for one field, invoice overrides first.
 */
function invoiceFallbackQuery(column: string, contractTypeId?: number | null) {
  if (isInvoiceType(contractTypeId)) {
    const override = _.find(prompts.invoiceQueries, { dbName: column });
    if (override) return override;
  }
  return _.find(prompts.utils.allQueries, { dbName: column });
}

export async function processAdditionalContractData({
  filePath,
  fileId,
  contractId,
  userId,
  logger,
  organizationId,
  columns,
  parentJsonField,
  processor,
  contractTypeId,
}: {
  filePath: string;
  fileId: string;
  contractId: number;
  userId: string;
  logger: any;
  organizationId: string;
  columns: string[];
  parentJsonField?: string;
  processor: ModelProvider;
  contractTypeId?: number | null;
}): Promise<ContractProcessingResult> {
  try {
    const startTime = performance.now();
    let data;
    let usage;
    if (processor === ModelProvider.google) {
      const resolver = await createPromptResolver();
      const queries = await Promise.all(
        columns.map(async (column) => {
          const fallback = invoiceFallbackQuery(column, contractTypeId);
          const result = await resolver.resolvePrompt({
            fieldName: column,
            fallbackPrompt: fallback,
            moduleId: MODULE_IDS.cpm,
          });
          return result.promptQuery;
        }),
      );
      const { data: googleData, usage: googleUsage } =
        await getContractBasicsWithGoogle(filePath, queries);
      data = googleData;
      usage = googleUsage;
    } else {
      const { data: openaiData, usage: openaiUsage } = await getAdditionalData(
        fileId,
        columns,
      );
      data = openaiData;
      usage = openaiUsage;
    }
    const endTime = performance.now();
    const durationSeconds = getDurationSeconds(startTime, endTime);
    const transformedData = transformAiExtractionData(data);
    await updateAiExtractionJson(contractId, transformedData, parentJsonField);
    await saveAiExtractionStatus(AI_SUCCESS, contractId);
    return {
      durationSeconds,
      nTotalTokens: usage?.total_tokens,
      nPromptTokens: usage?.prompt_tokens,
      nCompletionTokens: usage?.completion_tokens,
    };
  } catch (error) {
    await saveAiExtractionStatus(AI_FAILED, contractId);
    logError(logger, error, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      details: (error as { details?: unknown })?.details,
      userId,
      organizationId,
      contractId,
      fileId,
    });
    throw error;
  }
}

export async function processContractLineage({
  filePath,
  fileId,
  contractId,
  userId,
  logger,
  organizationId,
  columns,
  vendorId,
  processor,
}: {
  filePath: string;
  fileId: string;
  contractId: number;
  userId: string;
  logger: any;
  organizationId: string;
  columns: string[];
  vendorId: number;
  processor: ModelProvider;
}): Promise<ContractProcessingResult> {
  try {
    const startTime = performance.now();
    let data;
    let usage;
    if (processor === ModelProvider.google) {
      const resolver = await createPromptResolver();
      const queries = await Promise.all(
        columns.map(async (column) => {
          const fallback = _.find(prompts.additionalQueries, {
            dbName: column,
          });
          const result = await resolver.resolvePrompt({
            fieldName: column,
            fallbackPrompt: fallback,
            moduleId: MODULE_IDS.cpm,
          });
          return result.promptQuery;
        }),
      );
      const { data: googleData, usage: googleUsage } =
        await getContractBasicsWithGoogle(filePath, queries);
      data = googleData;
      usage = googleUsage;
    } else {
      const { data: openaiData, usage: openaiUsage } = await getAdditionalData(
        fileId,
        columns,
      );
      data = openaiData;
      usage = openaiUsage;
    }

    const { parent_agreement_type, parent_agreement_date } = data;
    const parentContractTypeId =
      contractTypes[parent_agreement_type as keyof typeof contractTypes];
    const contract = (await fetchContract({ id: contractId })) as any;
    const contractTypeId = contract?.type_id;

    // Contracts keep the historical vendor id they were signed under, so a
    // vendor merged into another (or the acquirer itself) has candidates
    // stored under sibling ids. Expand once here; strategies receive the
    // array. The scalar `vendorId` stays as-is — it stamps `contracts.vendor_id`
    // and `metadata.vendor_id`, which must remain historical.
    const vendorIds = await expandVendorLineageIds(vendorId);

    const strategyParams: ContractLineageStrategyParams = {
      contract,
      data,
      vendorId,
      vendorIds,
      organizationId,
      contractId,
      parent_agreement_type,
      parent_agreement_date,
      parentContractTypeId,
    };

    const strategy =
      contractTypeId && String(contractTypeId) in contractLineageStrategies
        ? contractLineageStrategies[String(contractTypeId)]
        : contractLineageStrategies.default;

    const result = await strategy(strategyParams);
    // order_number is written separately (see setContractOrderNumber) so this
    // can't clobber a manually-entered value. The rest of the lineage patch is
    // merged into metadata.lineage (see mergeContractLineage) rather than
    // replacing it wholesale, so it also can't delete order_number (or any
    // other sibling key) as a side effect.
    const { order_number: extractedOrderNumber, ...lineageWithoutOrderNumber } =
      data;
    await mergeContractLineage(contractId, lineageWithoutOrderNumber);
    if (extractedOrderNumber) {
      await setContractOrderNumber(contractId, extractedOrderNumber);
    }
    if (result?.parent_contract_id && result?.contract_relationship_id) {
      data.parent_contract_id = result.parent_contract_id;
      data.child_contract_id = result.child_contract_id;
      data.contract_relationship_id = result.contract_relationship_id;
    }
    const endTime = performance.now();
    const durationSeconds = getDurationSeconds(startTime, endTime);
    return {
      data,
      durationSeconds,
      nTotalTokens: usage?.total_tokens,
      nPromptTokens: usage?.prompt_tokens,
      nCompletionTokens: usage?.completion_tokens,
    };
  } catch (error) {
    logError(logger, error, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      details: (error as { details?: any })?.details,
      userId,
      organizationId,
      contractId,
      fileId,
    });
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('Error downloading PDF: {}')) {
      throw new NonRetriableError(errorMessage);
    }
    // Lineage invariant violations are deterministic in the contract rows, so a
    // retry re-alerts and fails identically. Alerting already happened upstream.
    if (error instanceof ContractLineageInvariantError) {
      throw new NonRetriableError(errorMessage);
    }
    throw error;
  }
}

/** A stated user count, or null when the document does not give one. */
function parseUserCount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Free text off an invoice line, or null when the line does not carry it. */
function parseLineText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * A quantity or rate off an invoice line. Kept as a float — a rate is priced to
 * the cent and a quantity is not always whole.
 */
function parseLineNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseFloat(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A billing-period boundary off an invoice line. These land in a `date` column,
 * so anything the model did not return as YYYY-MM-DD is dropped rather than
 * handed to Postgres to interpret.
 */
function parseLineDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;

  const [year, month, day] = trimmed.split('-').map(Number);
  const asDate = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    asDate.getUTCFullYear() === year &&
    asDate.getUTCMonth() === month - 1 &&
    asDate.getUTCDate() === day;
  return isRealDate ? trimmed : null;
}

type YearSpan = { min: number; max: number };

/**
 * The span of absolute years an extraction covers.
 *
 * A relative year is a position in this span, so a year the document skips
 * still consumes a slot and "year 2" means the second year of the term rather
 * than the second year the document happens to mention. Held as two bounds
 * rather than the materialised list of every intervening year: a model that
 * answers a full date where a year belongs ("20240101") would otherwise
 * allocate millions of entries inside a background job.
 */
function toYearSpan(years: number[]): YearSpan | null {
  return years.reduce<YearSpan | null>((span, year) => {
    if (!Number.isFinite(year)) return span;
    if (!span) return { min: year, max: year };
    return {
      min: Math.min(span.min, year),
      max: Math.max(span.max, year),
    };
  }, null);
}

/**
 * The 1-indexed position of `year` within the span, or null when it falls
 * outside the span or is not a number. Callers decide what an unplaceable year
 * becomes.
 */
function relativeYear(year: number, span: YearSpan | null): number | null {
  if (!span || !Number.isFinite(year)) return null;
  if (year < span.min || year > span.max) return null;
  return year - span.min + 1;
}

/**
 * Tolerantly read the credits answer. Same shapes as `products_list`, plus the
 * bare object the model returns when it finds exactly one credit.
 */
function parseCreditsList(credits_list: unknown): unknown[] | null {
  const asArray = parseProductsList(credits_list);
  if (asArray) return asArray;

  const value: unknown =
    typeof credits_list === 'string'
      ? (() => {
          try {
            return JSON.parse(credits_list);
          } catch {
            return null;
          }
        })()
      : credits_list;

  return value && typeof value === 'object' && !Array.isArray(value)
    ? [value]
    : null;
}

/**
 * A credit amount, as a positive magnitude. Invoices print credits
 * parenthesised, signed, or both -- "- (9,289.62)" -- but the deduction is
 * carried by the column the value lands in, not by the value, so every
 * separator and sign is stripped rather than interpreted.
 */
function parseCreditAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const digits = String(value).replace(/[^\d.]/g, '');
  if (digits === '') return null;
  const parsed = parseFloat(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

export type NormalizedCredit = {
  year: number;
  amount: number;
  name: string;
  product_code: string | null;
};

/**
 * The credit lines an invoice states, as rows ready to link to a product.
 */
export function normalizeCreditsList(
  credits_list: unknown,
  productYears: number[] = [],
): NormalizedCredit[] | undefined {
  const parsed = parseCreditsList(credits_list);
  if (!parsed) return;

  const rows = parsed
    .map((credit: any) => ({
      year: parseInt(String(credit?.year), 10),
      amount: parseCreditAmount(credit?.cost),
      name: parseLineText(credit?.product_name),
      product_code: parseLineText(credit?.product_code),
    }))
    .filter(
      (credit) =>
        credit.amount !== null &&
        credit.amount > 0 &&
        credit.name !== null &&
        !!toCompareKey(credit.name),
    );
  if (!rows.length) return;

  const span = toYearSpan(
    productYears.length ? productYears : rows.map((credit) => credit.year),
  );

  return rows.map((credit) => {
    return {
      year: relativeYear(credit.year, span) ?? 1,
      amount: credit.amount as number,
      name: credit.name as string,
      product_code: credit.product_code,
    };
  });
}

// A comma followed by the last one or two digits is a decimal separator, as
// in "€2.681,80" or "2681,80". Stripping it with the other symbols would turn
// the cents into more euros, so promote it to a period and drop the dots
// (thousands separators) first. "€2,681.80" is left to the plain cleanup.
function cleanCost(cost: string) {
  const trimmed = cost.trim();
  const commaDecimal =
    /,\d{1,2}$/.test(trimmed) &&
    trimmed.lastIndexOf(',') > trimmed.lastIndexOf('.');
  const periodDecimal = commaDecimal
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed;
  return periodDecimal.replace(/[^\d.-]/g, '');
}

export function normalizeProductsList(products_list: unknown) {
  const parsedProductsList = parseProductsList(products_list);
  if (!parsedProductsList) return;
  const normalizedProductsList = parsedProductsList.map((product: any) => ({
    ...product,
    cost: product.cost ? cleanCost(String(product.cost)) : null,
  }));
  const sortedProducts = _(normalizedProductsList)
    .map((product) => ({
      year: parseInt(product.year),
      fees: product.cost ? parseFloat(product.cost) : null,
      name: product.product_name,
      // Only Exchange Agreement extractions supply this; absent elsewhere.
      product_code: product.product_code ?? null,
      // parseInt(null) is NaN, and the Exchange Agreement schema reports an
      // unstated user count as null, so guard rather than propagate NaN.
      n_users: parseUserCount(product.n_users),
      account_number: parseLineText(product.account_number),
      quantity: parseLineNumber(product.quantity),
      change_activity: parseLineText(product.change_activity),
      rate: parseLineNumber(product.rate),
      period_start: parseLineDate(product.period_start),
      period_end: parseLineDate(product.period_end),
    }))
    .sortBy('year')
    .value();
  if (!sortedProducts.length) return;
  const span = toYearSpan(sortedProducts.map((product) => product.year));
  const normalizedProducts = sortedProducts.map((product) => ({
    // 0 for a year that is not a number, which is what the previous
    // Array.indexOf lookup yielded for one. Left as it was: this path is not
    // what changed here.
    year: relativeYear(product.year, span) ?? 0,
    fees: product.fees,
    name: product.name,
    product_code: product.product_code,
    n_users: product.n_users,
    account_number: product.account_number,
    quantity: product.quantity,
    change_activity: product.change_activity,
    rate: product.rate,
    period_start: product.period_start,
    period_end: product.period_end,
  }));
  return normalizedProducts;
}

/**
 * Extracts the product table of an Exchange Agreement document, including each
 * line's Exchange Agreement Product Code.
 *
 * Separate from processAdditionalContractData because the shared products_list
 * prompt has no notion of a product code, and its fallback resolves to the
 * @postsig/toolkit copy rather than this repo's. Writes the same
 * `ai_extraction.products_list` array shape the legacy prompt produces, plus
 * `product_code`, so downstream consumers need no changes.
 */
export async function processExchangeAgreementProducts({
  filePath,
  contractId,
  userId,
  logger,
  organizationId,
}: {
  filePath: string;
  contractId: number;
  userId: string;
  logger: any;
  organizationId: string;
}): Promise<ContractProcessingResult> {
  try {
    const startTime = performance.now();
    const { data, usage } = await getContractBasicsWithGoogle(filePath, [
      exchangeAgreementProductsListQuery,
    ]);

    const parsed = exchangeAgreementProductsListSchema.safeParse(
      data?.products_list,
    );

    if (!parsed.success) {
      // A shape mismatch means every product link for this contract is lost,
      // which is invisible in the UI: the form simply shows no products. Alert,
      // then fail the step so the contract is marked AI_FAILED and Inngest
      // retries, rather than completing as a success with nothing extracted.
      logAlert(
        'exchange-agreement-products-invalid',
        parsed.error,
        { contractId, organizationId, userId },
        'Exchange Agreement product extraction did not match the expected schema',
      );
      throw parsed.error;
    }

    await updateAiExtractionJson(contractId, {
      products_list: parsed.data.map(sanitizeExchangeAgreementProduct),
    });

    const endTime = performance.now();
    return {
      durationSeconds: getDurationSeconds(startTime, endTime),
      nTotalTokens: usage?.total_tokens,
      nPromptTokens: usage?.prompt_tokens,
      nCompletionTokens: usage?.completion_tokens,
    };
  } catch (error) {
    await saveAiExtractionStatus(AI_FAILED, contractId);
    logError(logger, error, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      userId,
      organizationId,
      contractId,
    });
    throw error;
  }
}

export async function processVendorProducts({
  contractId,
  userId,
  logger,
  organizationId,
}: {
  contractId: number;
  userId: string;
  logger: any;
  organizationId: string;
}): Promise<any> {
  try {
    const contract = (await fetchContract({ id: contractId })) as any;
    const { ai_extraction, vendor_id } = contract;
    if (!vendor_id) {
      return;
    }
    const { products_list }: any = ai_extraction;
    if (!products_list) {
      return;
    }
    const normalizedProducts = normalizeProductsList(products_list);
    if (!normalizedProducts) {
      logger.warn({
        contractId,
        organizationId,
        message:
          'products_list missing or unparseable; skipped product linking',
      });
      return;
    }
    const allowDuplicates = isInvoiceType(contract.type_id);
    if (allowDuplicates) {
      // Clearing the contract's rows first is what lets a repeated product be
      // inserted rather than matched, but the delete commits before the writes
      // below — nothing here runs in a transaction. So it must not run unless
      // at least one line will actually be written back, or an extraction whose
      // names are all unusable wipes the contract's products and puts nothing
      // in their place.
      const writableLines = normalizedProducts.filter((product) =>
        toCompareKey(product.name),
      );
      if (writableLines.length === 0) {
        logger.warn({
          contractId,
          organizationId,
          message:
            'No usable product names in products_list; kept the existing product rows',
        });
        return;
      }
      await removeVendorProductDetail(contractId);
    }
    for (const product of normalizedProducts) {
      const { year, fees, name, product_code, n_users } = product;
      if (!toCompareKey(name)) {
        logger.warn({
          contractId,
          organizationId,
          productName: name,
          message: 'Product name has no letters or digits; skipped',
        });
        continue;
      }
      // A Euronext code encodes the same use- and customer-category the
      // description spells out, so the two are read independently and compared.
      // Disagreement means one of them is wrong — typically a transposed or
      // mis-read code, which exact matching would otherwise accept and attach
      // the fee to the wrong product.
      const axes = crossCheckProductCode(name, product_code);
      if (axes.conflicts.length > 0) {
        logAlert(
          'vendor-product-code-conflict',
          undefined,
          {
            contractId,
            organizationId,
            vendorId: vendor_id,
            productName: name,
            productCode: product_code,
            contradictoryAxes: axes.conflicts,
          },
          'Exchange Agreement product name and code disagree; linking on the code regardless',
        );
      }

      const vendorProduct = await searchVendorProducts(
        vendor_id,
        name,
        product_code,
      );
      if (vendorProduct) {
        await saveVendorProductDetail({
          contractId,
          productId: vendorProduct.id,
          year,
          fees,
          userId,
          n_users,
          account_number: product.account_number,
          quantity: product.quantity,
          change_activity: product.change_activity,
          rate: product.rate,
          period_start: product.period_start,
          period_end: product.period_end,
          allowDuplicates,
        });
      } else {
        // A miss is indistinguishable from a genuinely new product without
        // this, which is how name-normalisation failures silently forked
        // duplicate vendor_products rows.
        logger.warn({
          contractId,
          organizationId,
          vendorId: vendor_id,
          productName: name,
          message: 'No matching vendor product; creating a new one',
        });
        try {
          const newVendorProduct = (await createVendorProduct(
            vendor_id,
            name,
            product_code,
          )) as any;
          await saveVendorProductDetail({
            contractId,
            productId: newVendorProduct.id,
            year,
            fees,
            userId,
            n_users,
            account_number: product.account_number,
            quantity: product.quantity,
            change_activity: product.change_activity,
            rate: product.rate,
            period_start: product.period_start,
            period_end: product.period_end,
            allowDuplicates,
          });
        } catch (error) {
          logger.error({
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            userId,
            organizationId,
            contractId,
          });
        }
      }
    }
  } catch (error) {
    logError(logger, error, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      details: (error as { details?: any })?.details,
      userId,
      organizationId,
      contractId,
    });
    throw error;
  }
}

/**
 * Links the credit lines an invoice states to products and stores them.
 *
 * Runs after process-vendor-products so a credit naming a product that only
 * appears in the credit block still resolves against the rows that step just
 * created. Only invoice types carry credits; every other type returns early.
 *
 * A failure here is alertable but never fatal: the products are already saved
 * and an extractor can enter credits by hand, so losing them must not fail the
 * whole extraction.
 */
export async function processContractCredits({
  contractId,
  userId,
  logger,
  organizationId,
}: {
  contractId: number;
  userId: string;
  logger: any;
  organizationId: string;
}): Promise<void> {
  const contract = (await fetchContract({ id: contractId })) as any;
  const { ai_extraction, vendor_id } = contract ?? {};
  if (!isInvoiceType(contract?.type_id)) return;

  if (!vendor_id) {
    logger.warn({
      contractId,
      organizationId,
      message:
        'Contract has no vendor; extracted credits were not linked and are not stored',
    });
    return;
  }

  const { credits_list, products_list }: any = ai_extraction ?? {};
  if (!credits_list) return;

  const productYears = (parseProductsList(products_list) ?? [])
    .map((product: any) => parseInt(String(product?.year), 10))
    .filter((year: number) => Number.isFinite(year));

  const credits = normalizeCreditsList(credits_list, productYears);
  if (!credits?.length) {
    logger.warn({
      contractId,
      organizationId,
      message:
        'credits_list held no usable credits; kept the existing credit rows',
    });
    return;
  }

  try {
    const resolved: ContractProductCreditInput[] = [];
    for (const credit of credits) {
      const existing = await searchVendorProducts(
        vendor_id,
        credit.name,
        credit.product_code,
      );
      const product =
        existing ??
        ((await createVendorProduct(
          vendor_id,
          credit.name,
          credit.product_code,
        )) as any);
      if (!product?.id) {
        logger.warn({
          contractId,
          organizationId,
          vendorId: vendor_id,
          productName: credit.name,
          message: 'Could not resolve a product for a credit; skipped',
        });
        continue;
      }
      resolved.push({
        productId: product.id,
        year: credit.year,
        amount: credit.amount,
      });
    }

    if (!resolved.length) {
      logger.warn({
        contractId,
        organizationId,
        message:
          'No credit line resolved to a product; kept the existing credit rows',
      });
      return;
    }

    await replaceContractProductCredits({
      contractId,
      organizationId,
      userId,
      credits: resolved,
    });
  } catch (error) {
    logAlert(
      'contract-product-credits-write-failure',
      error,
      { contractId, organizationId, vendorId: vendor_id },
      'Failed to store invoice credits; the contract keeps its other extracted data',
    );
  }
}

/**
 * Extraction values that mean "this addendum changes the prior product
 * schedule". Both raise one blanket, pending event; ops decides in the
 * confirmation queue whether it really replaces everything and, for
 * modifies_specific, which products it names. `adds_to_prior` and `none`
 * declare no cancellation, so they create nothing.
 */
const PRODUCT_SCHEDULE_EVENT_ACTIONS = [
  'replaces_all_prior',
  'modifies_specific',
];

/**
 * Tolerantly read `product_schedule_action` out of a contract's extraction
 * JSON. The field may be absent (the toolkit prompt that produces it may not
 * be published yet), a bare string, or a `{ action, evidence[] }` object.
 * Anything unusable yields null so the caller no-ops.
 */
function parseProductScheduleAction(aiExtraction: unknown): {
  declaredAction: string;
  evidence: Json[] | null;
} | null {
  if (!aiExtraction || typeof aiExtraction !== 'object') return null;

  const raw = (aiExtraction as Record<string, unknown>).product_schedule_action;
  const parsed = typeof raw === 'string' ? { action: raw } : raw;
  if (!parsed || typeof parsed !== 'object') return null;

  const { action, evidence } = parsed as Record<string, unknown>;
  if (
    typeof action !== 'string' ||
    !PRODUCT_SCHEDULE_EVENT_ACTIONS.includes(action)
  ) {
    return null;
  }

  return {
    declaredAction: action,
    evidence: Array.isArray(evidence) ? (evidence as Json[]) : null,
  };
}

interface StepLogger {
  info(payload: Record<string, unknown>): void;
  warn(payload: Record<string, unknown>): void;
  error(payload: Record<string, unknown>): void;
}

/**
 * Record an addendum's declaration that it changes the prior product schedule
 * as a pending lineage event (PSK-1830).
 *
 * Every unusable shape — missing field, malformed JSON, unknown enum value —
 * is a silent no-op: this runs inside the extraction pipeline and must never
 * fail a contract's processing over a classification it could not read.
 */
export async function processProductScheduleAction({
  contractId,
  userId,
  logger,
  organizationId,
}: {
  contractId: number;
  userId: string;
  logger: StepLogger;
  organizationId: string;
}): Promise<void> {
  try {
    const contract = (await fetchContract({ id: contractId })) as {
      ai_extraction?: unknown;
    } | null;
    const declaration = parseProductScheduleAction(contract?.ai_extraction);
    if (!declaration) return;

    const { created } = await createPendingProductLineageEvent({
      contractId,
      organizationId,
      // AI only ever declares blanket replacement; naming individual products
      // is a human decision made in the confirmation queue.
      action: 'replace_all_prior',
      evidence: declaration,
      createdBy: userId,
      source: 'ai',
    });

    // Log the classification and how much evidence backed it, never the
    // evidence itself — those entries are verbatim contract quotes.
    logger.info({
      contractId,
      organizationId,
      created,
      declaredAction: declaration.declaredAction,
      evidenceCount: declaration.evidence?.length ?? 0,
    });
  } catch (error) {
    // Deliberately swallowed: a lineage declaration is supplementary, and
    // failing here would fail the whole extraction for the contract. It still
    // pages a monitor — a silently dropped declaration means the lineage view
    // under-reports cancellations with nothing visible to notice it by.
    logError(logger, error, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      userId,
      organizationId,
      contractId,
    });
    logAlert(
      'contract-processing-failure',
      error,
      {
        processName: 'processProductScheduleAction',
        contractId,
        userId,
        organizationId,
      },
      'Failed to record product schedule lineage event',
    );
  }
}

export async function processAssetClasses({
  filePath,
  fileId,
  contractId,
  userId,
  logger,
  organizationId,
  columns,
  processor,
}: {
  filePath: string;
  fileId: string;
  contractId: number;
  userId: string;
  logger: any;
  organizationId: string;
  columns: string[];
  processor: ModelProvider;
}): Promise<ContractProcessingResult> {
  try {
    const startTime = performance.now();
    let data;
    let usage;
    if (processor === ModelProvider.google) {
      const { data: googleData, usage: googleUsage } =
        await getContractBasicsWithGoogle(filePath, prompts.assetClassQueries);
      data = googleData;
      usage = googleUsage;
    } else {
      const { data: openaiData, usage: openaiUsage } = await getAdditionalData(
        fileId,
        columns,
      );
      data = openaiData;
      usage = openaiUsage;
    }

    const assetClassesArray = Array.isArray(data?.asset_classes)
      ? data.asset_classes
      : [];

    if (assetClassesArray.length > 0) {
      await removeAssetClasses(contractId);
      for (const item of assetClassesArray) {
        const { name, sub_asset_classes } = item;
        const assetClass = (await searchAssetClasses(name)) as any;
        if (assetClass) {
          if (
            Array.isArray(sub_asset_classes) &&
            sub_asset_classes.length > 0
          ) {
            for (const subAssetClassName of sub_asset_classes) {
              const subAssetClassResult = (await searchSubAssetClasses(
                subAssetClassName,
              )) as any;
              await saveAssetClass(
                contractId,
                assetClass.id,
                subAssetClassResult?.id,
              );
            }
          } else {
            await saveAssetClass(contractId, assetClass.id, undefined, true);
          }
        }
      }
    }
    await updateAiExtractionJson(contractId, data);
    const endTime = performance.now();
    const durationSeconds = getDurationSeconds(startTime, endTime);
    return {
      data,
      durationSeconds,
      nTotalTokens: usage?.total_tokens,
      nPromptTokens: usage?.prompt_tokens,
      nCompletionTokens: usage?.completion_tokens,
    };
  } catch (error) {
    logError(logger, error, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      details: (error as { details?: any })?.details,
      userId,
      organizationId,
      contractId,
      fileId,
    });
    throw error;
  }
}

export async function processTechnical({
  filePath,
  fileId,
  contractId,
  userId,
  logger,
  organizationId,
  processor,
}: {
  filePath: string;
  fileId: string;
  contractId: number;
  userId: string;
  logger: any;
  organizationId: string;
  processor: ModelProvider;
}): Promise<ContractProcessingResult> {
  try {
    const startTime = performance.now();
    let data;
    let usage;
    if (processor === ModelProvider.google) {
      const { data: googleData, usage: googleUsage } =
        await getContractBasicsWithGoogle(filePath, prompts.technicalQueries);
      data = googleData;
      usage = googleUsage;
    } else {
      data = {};
      usage = {};
    }
    const endTime = performance.now();
    const durationSeconds = getDurationSeconds(startTime, endTime);
    await updateAiExtractionJson(contractId, data, 'technical', 'metadata');
    return {
      data,
      durationSeconds,
      nTotalTokens: usage?.total_tokens,
      nPromptTokens: usage?.prompt_tokens,
      nCompletionTokens: usage?.completion_tokens,
    };
  } catch (error) {
    logError(logger, error, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      details: (error as { details?: any })?.details,
      userId,
      organizationId,
      contractId,
      fileId,
    });
    throw error;
  }
}

export async function processMetadata({
  filePath,
  fileId,
  contractId,
  userId,
  logger,
  organizationId,
  columns,
  parentJsonField,
  processor,
}: {
  filePath: string;
  fileId: string;
  contractId: number;
  userId: string;
  logger: any;
  organizationId: string;
  columns: string[];
  parentJsonField?: string;
  processor: ModelProvider;
}): Promise<ContractProcessingResult> {
  try {
    const startTime = performance.now();
    let data;
    let usage;
    if (processor === ModelProvider.google) {
      const resolver = await createPromptResolver();
      const queries = await Promise.all(
        columns.map(async (column) => {
          const fallback = _.find(prompts.utils.allQueries, { dbName: column });
          const result = await resolver.resolvePrompt({
            fieldName: column,
            fallbackPrompt: fallback,
            moduleId: MODULE_IDS.cpm,
          });
          return result.promptQuery;
        }),
      );
      const { data: googleData, usage: googleUsage } =
        await getContractBasicsWithGoogle(filePath, queries);
      data = googleData;
      usage = googleUsage;
    } else {
      data = {};
      usage = {};
    }
    const endTime = performance.now();
    const durationSeconds = getDurationSeconds(startTime, endTime);
    await updateAiExtractionJson(contractId, data, parentJsonField, 'metadata');
    return {
      data,
      durationSeconds,
      nTotalTokens: usage?.total_tokens,
      nPromptTokens: usage?.prompt_tokens,
      nCompletionTokens: usage?.completion_tokens,
    };
  } catch (error) {
    logError(logger, error, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      details: (error as { details?: any })?.details,
      userId,
      organizationId,
      contractId,
      fileId,
    });
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('Error downloading PDF: {}')) {
      throw new NonRetriableError(errorMessage);
    }
    throw error;
  }
}

export async function processDataDeliveryMethods({
  contractId,
  userId,
  logger,
  organizationId,
}: {
  contractId: number;
  userId: string;
  logger: any;
  organizationId: string;
}): Promise<any> {
  try {
    const contract = (await fetchContract({ id: contractId })) as any;
    const { ai_extraction } = contract;
    const { data_delivery_methods }: any = ai_extraction;

    if (!data_delivery_methods) {
      return;
    }

    const deliveryMethods = Array.isArray(data_delivery_methods)
      ? data_delivery_methods
      : [];

    if (deliveryMethods.length === 0) {
      return;
    }

    await removeContractDataDeliveryTypes(contractId);

    for (const methodName of deliveryMethods) {
      if (typeof methodName !== 'string' || !methodName.trim()) {
        continue;
      }

      const trimmedName = methodName.trim();
      let deliveryType = (await searchDataDeliveryTypes(trimmedName)) as any;

      if (!deliveryType) {
        deliveryType = (await createDataDeliveryType(trimmedName)) as any;
      }

      if (deliveryType) {
        await saveContractDataDeliveryType(contractId, deliveryType.id);
      }
    }
  } catch (error) {
    logError(logger, error, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      details: (error as { details?: any })?.details,
      userId,
      organizationId,
      contractId,
    });
    throw error;
  }
}

const commonFieldsToExclude = [
  'hr',
  'vendor_products_details',
  'number_of_users',
  'vendor_products_users',
  'asset_classes',
  'contract_data_delivery_types',
  'cancel_by_date',
  'postsig_notes',
  'ai_notes',
  'summary',
];

const hasValue = (value: any): boolean => {
  return value !== null && value !== undefined && value !== '';
};

const parseVendorProductsDetails = (vendorProductsDetails: any) => {
  return vendorProductsDetails.map((detail: any) => ({
    id: detail.id,
    product_id: detail.product_id,
    product_name: detail?.vendor_products?.name,
    product_code: detail?.vendor_products?.product_code,
    vendor_name: detail?.vendor_products?.vendors?.name,
    year: detail?.year,
    fees: detail?.fees,
  }));
};

export async function processLineageFieldAnalysis({
  parentContractId,
  childContractId,
  contractRelationshipId,
  logger,
}: {
  parentContractId: number;
  childContractId: number;
  contractRelationshipId: number;
  logger: any;
}): Promise<void> {
  try {
    const parentContractDoc = await getContractDocument(parentContractId);
    const childContractDoc = await getContractDocument(childContractId);
    const parentContract = (await getContractById(parentContractId)) as any;
    const childContract = (await getContractById(childContractId)) as any;
    const { type_id: parentContractTypeId } = parentContract;
    if (!parentContractTypeId) {
      throw new Error('Parent contract type ID not found');
    }
    const { type_id: childContractTypeId } = childContract;
    if (!childContractTypeId) {
      throw new Error('Child contract type ID not found');
    }
    const parentContractType: any =
      contractTypeIdToFormTypeMap[baseContractTypeId(parentContractTypeId)];
    const childContractType: any =
      contractTypeIdToFormTypeMap[baseContractTypeId(childContractTypeId)];
    const parentContractFields = getContractFields(parentContractType);
    const childContractFields = getContractFields(childContractType);
    const commonFields = _.intersectionBy(
      parentContractFields,
      childContractFields,
      'fieldName',
    );
    const commonFieldsWithValues = commonFields
      .map((field: any) => ({
        fieldName: field.fieldName,
        parentValue: field.getContractValue
          ? field.getContractValue(
              parentContract[field.fieldName as keyof typeof parentContract],
            )
          : parentContract[field.fieldName as keyof typeof parentContract],
        childValue: field.getContractValue
          ? field.getContractValue(
              childContract[field.fieldName as keyof typeof childContract],
            )
          : childContract[field.fieldName as keyof typeof childContract],
      }))
      .filter((field: any) => !commonFieldsToExclude.includes(field.fieldName))
      .filter((field: any) => hasValue(field.childValue));
    const parentVendorProductsDetails = parseVendorProductsDetails(
      parentContract.vendor_products_details,
    );
    const childVendorProductsDetails = parseVendorProductsDetails(
      childContract.vendor_products_details,
    );
    commonFieldsWithValues.push({
      fieldName: 'vendor_products_details',
      parentValue: parentVendorProductsDetails,
      childValue: childVendorProductsDetails,
    });
    const fieldAnalysis = await getFieldAnalysis({
      parentContract: parentContract,
      childContract: childContract,
      fieldsWithValues: commonFieldsWithValues,
      parentContractDoc: parentContractDoc,
      childContractDoc: childContractDoc,
    });
  } catch (error) {
    logError(logger, error, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}
