import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { CommonError } from '@/constants/types';
import { fieldTransformations } from '@/constants/data';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

class CustomError extends Error {
  status: number;
  data: any;
  constructor(errorMessage?: string, statusCode?: number, errorData?: any) {
    super(errorMessage || 'An error occurred');
    this.status = statusCode || 500;
    this.data = errorData || {};
  }
}

export function generateError({
  errorMessage,
  statusCode,
  errorData,
}: CommonError) {
  const error = new CustomError(errorMessage, statusCode, errorData);
  return error;
}

export const runPromisesSequentially = async (promises: Promise<any>[]) => {
  const results = [];
  for (const promise of promises) {
    const result = await promise;
    results.push(result);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return results;
};

/**
 * Calculates extended term end date from extended_confidentiality_period
 * Used for NDA contracts to determine extended confidentiality obligations
 */
export function calculateExtendedTermEndDate(
  termEndDate: string | null,
  extendedConfidentialityPeriod: string | number | null,
): string | null {
  if (!termEndDate || !extendedConfidentialityPeriod) {
    return null;
  }

  const months = Number(extendedConfidentialityPeriod);
  if (isNaN(months)) {
    return null;
  }

  try {
    const { addMonths, parseISO, format } = require('date-fns');
    const endDate = addMonths(parseISO(termEndDate), months);
    return format(endDate, 'yyyy-MM-dd');
  } catch (error) {
    console.error('Error calculating extended term end date:', error);
    return null;
  }
}

function setNestedValue(
  obj: Record<string, any>,
  path: string,
  value: any,
): Record<string, any> {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (
      !(key in current) ||
      typeof current[key] !== 'object' ||
      current[key] === null
    ) {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
  return obj;
}

export function transformAiExtractionData(data: any) {
  return Object.entries(data).reduce(
    (acc, [key, value]) => {
      const transformation =
        fieldTransformations[key as keyof typeof fieldTransformations];
      if (transformation?.outputPath) {
        return setNestedValue(acc, transformation.outputPath, value);
      } else {
        return setNestedValue(acc, key, value);
      }
    },
    {} as Record<string, any>,
  );
}

/**
 * `products_list` is a JSON array carried in a Gemini STRING field, so a
 * truncated or malformed response is expected rather than exceptional. It must
 * not throw: the caller would lose every product link for the contract.
 */
export function parseProductsList(products_list: unknown): unknown[] | null {
  if (Array.isArray(products_list)) return products_list;
  if (typeof products_list !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(products_list);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Validates that a redirect path is safe (internal only).
 * Prevents open redirect vulnerabilities (OWASP A03:2021).
 */
export function isValidInternalPath(path: string): boolean {
  if (!path || typeof path !== 'string') return false;
  // Must start with single slash (relative path)
  if (!path.startsWith('/')) return false;
  // Prevent protocol-relative URLs (e.g., //evil.com)
  if (path.startsWith('//')) return false;
  // Prevent URLs with protocol
  if (path.includes('://')) return false;
  // Prevent backslash tricks (e.g., /\evil.com)
  if (path.includes('\\')) return false;
  return true;
}
