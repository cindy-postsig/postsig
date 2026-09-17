/**
 * Chat Columns Module
 *
 * Reusable column definitions for contract tables in the chatbot.
 * These columns can be composed to build different table views.
 */

import type { ColumnConfig } from '@/components/chatbot/GenericDataTable';
import { ContractLink } from '@/components/chatbot/ContractLink';
import { PermissionBadge } from '@/components/chatbot/PermissionBadge';
import ContractLabel from '@/components/contracts/ContractLabel';
import VendorIcon from '@/components/vendors/VendorIcon';
import { formatCurrency } from '@/lib/v2/chat/transforms';
import type { PermissionLevel } from '@/lib/v2/chat/types';

// =============================================================================
// BASE ROW TYPES
// =============================================================================

/**
 * Row type for tables with contract ID
 */
export interface ContractIdRow extends Record<string, unknown> {
  contractId: number;
}

/**
 * Row type for tables with vendor name
 */
export interface VendorRow extends Record<string, unknown> {
  vendorName: string;
}

/**
 * Row type for tables with contract type
 */
export interface ContractTypeRow extends Record<string, unknown> {
  contractType: string;
}

/**
 * Row type for tables with permission
 */
export interface PermissionRow extends Record<string, unknown> {
  permission: PermissionLevel;
}

/**
 * Row type for tables with currency value
 */
export interface CurrencyRow extends Record<string, unknown> {
  [key: string]: unknown;
}

// =============================================================================
// COLUMN FACTORIES
// =============================================================================

/**
 * Creates a contract ID column with link
 */
export function createContractIdColumn<
  T extends ContractIdRow,
>(): ColumnConfig<T> {
  return {
    key: 'contractId' as keyof T & string,
    header: 'ID',
    render: (value) => <ContractLink contractId={value as number} />,
    className: 'text-muted-foreground',
  };
}

/**
 * Creates a vendor name column
 */
export function createVendorColumn<
  T extends VendorRow & ContractIdRow,
>(): ColumnConfig<T> {
  return {
    key: 'vendorName' as keyof T & string,
    header: 'Vendor',
    render: (value, row) => {
      const name = (value as string) || '-';
      const contractId = row.contractId as number;
      return (
        <ContractLink
          contractId={contractId}
          className="font-medium flex items-center gap-2 text-foreground no-underline hover:text-foreground hover:underline"
        >
          <VendorIcon name={name} width={24} height={24} />
          <span className="font-sans leading-tight">{name}</span>
        </ContractLink>
      );
    },
  };
}

/**
 * Creates a contract type column with label badge
 */
export function createContractTypeColumn<
  T extends ContractTypeRow,
>(): ColumnConfig<T> {
  return {
    key: 'contractType' as keyof T & string,
    header: 'Type',
    render: (value) => (
      <ContractLabel name={(value as string) || '-'} shorten={true} />
    ),
    className: 'max-w-[120px] truncate',
  };
}

/**
 * Creates a permission level column with badge
 */
export function createPermissionColumn<
  T extends PermissionRow,
>(): ColumnConfig<T> {
  return {
    key: 'permission' as keyof T & string,
    header: 'Permission',
    render: (value) => <PermissionBadge level={value as PermissionLevel} />,
    className: 'text-center',
    headerClassName: 'text-center',
  };
}

/**
 * Creates a currency column with formatting
 */
export function createCurrencyColumn<T extends CurrencyRow>(
  key: keyof T & string,
  header: string,
  options?: {
    className?: string;
    headerClassName?: string;
    fontWeight?: 'normal' | 'medium' | 'semibold';
  },
): ColumnConfig<T> {
  const { className, headerClassName, fontWeight = 'normal' } = options ?? {};
  const fontClass =
    fontWeight === 'semibold'
      ? 'font-semibold'
      : fontWeight === 'medium'
        ? 'font-medium'
        : '';

  return {
    key,
    header,
    render: (value) => (
      <span className={fontClass}>{formatCurrency(value as number)}</span>
    ),
    exportFormat: (value) => String(value),
    className: className ?? 'text-right',
    headerClassName: headerClassName ?? 'text-right',
  };
}

// =============================================================================
// COMPOSED COLUMN SETS
// =============================================================================

/**
 * Common columns for basic contract display: ID, Vendor, Type
 */
export function createBaseContractColumns<
  T extends ContractIdRow & VendorRow & ContractTypeRow,
>(): ColumnConfig<T>[] {
  return [
    createContractIdColumn<T>(),
    createVendorColumn<T>(),
    createContractTypeColumn<T>(),
  ];
}

/**
 * Columns for contract with permissions: ID, Vendor, Type, Permission
 */
export function createContractPermissionColumns<
  T extends ContractIdRow & VendorRow & ContractTypeRow & PermissionRow,
>(): ColumnConfig<T>[] {
  return [...createBaseContractColumns<T>(), createPermissionColumn<T>()];
}
