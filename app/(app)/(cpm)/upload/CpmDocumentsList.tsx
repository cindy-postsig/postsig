'use client';

import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api/v2-client';
import type { ContractsListResponse } from '@/app/api/v2/types/api';
import Link from 'next/link';
import VendorIcon from '@/components/vendors/VendorIcon';
import ContractLabel from '@/components/contracts/ContractLabel';
import { DocumentsTable } from '@/components/documents/DocumentsTable';
import {
  nameColumn,
  dateColumn,
  personColumn,
  statusColumn,
} from '@/components/documents/document-columns';
import type { DocumentStatusCategory } from '@/components/documents/DocumentStatusBadge';
import {
  getUserFriendlyErrorMessage,
  INVESTOR_DOCUMENT_ERROR_CODES,
} from '@/constants/investorDocumentErrors';

const USER_FACING_ERROR_CODES: Set<string> = new Set([
  INVESTOR_DOCUMENT_ERROR_CODES.UNSUPPORTED_FILE_TYPE,
  INVESTOR_DOCUMENT_ERROR_CODES.DUPLICATE_FILE,
]);

interface PendingContract {
  id: number;
  name: string;
  uploadedBy: string;
  vendorId: number | null;
  vendor: string;
  vendorDomain: string;
  documentType: string;
  statusLabel: string;
  statusCategory: DocumentStatusCategory;
  failureMessage?: string;
  updatedAt: string;
}

function extractFileName(contract: Record<string, unknown>): string {
  const docs = contract.contract_docs as { file_path?: string }[] | undefined;
  const filePath = docs?.[0]?.file_path;
  if (filePath) {
    return decodeURIComponent(filePath.split('/').pop() || '');
  }
  return (contract.name as string) || 'Untitled';
}

function getFailureErrorCode(
  contract: Record<string, unknown>,
): string | undefined {
  const metadata = contract.metadata as
    | { failure?: { error?: { code?: string } } }
    | undefined;
  return metadata?.failure?.error?.code;
}

function getDisplayStatus(contract: Record<string, unknown>): {
  label: string;
  category: DocumentStatusCategory;
  failureMessage?: string;
} {
  if (contract.ai_extraction_status === 'ai_failed') {
    const errorCode = getFailureErrorCode(contract);
    const failureMessage =
      errorCode && USER_FACING_ERROR_CODES.has(errorCode)
        ? getUserFriendlyErrorMessage(errorCode)
        : undefined;
    return { label: 'Failed', category: 'failed', failureMessage };
  }
  if (contract.status_id === 5) {
    return { label: 'Uploaded', category: 'complete' };
  }
  return { label: 'Processing', category: 'processing' };
}

const pendingColumns: ColumnDef<PendingContract, unknown>[] = [
  nameColumn<PendingContract>({ header: 'File Name' }),
  {
    id: 'documentType',
    header: 'Type',
    size: 120,
    cell: ({ row }) =>
      row.original.documentType ? (
        <ContractLabel name={row.original.documentType} shorten={true} />
      ) : (
        <span className="text-muted-foreground">--</span>
      ),
  },
  statusColumn<PendingContract>(
    (r) => ({
      label: r.statusLabel,
      category: r.statusCategory,
      failureMessage: r.failureMessage,
    }),
    { size: 140 },
  ),
  dateColumn<PendingContract>((r) => r.updatedAt, { header: 'Uploaded On' }),
  personColumn<PendingContract>((r) => r.uploadedBy, {
    header: 'Uploaded By',
    size: 160,
  }),
  {
    id: 'vendor',
    header: 'Vendor',
    size: 300,
    cell: ({ row }) => {
      const { vendorId, vendor, vendorDomain } = row.original;
      if (!vendor) {
        return <span className="text-muted-foreground">--</span>;
      }
      const hasLink = Boolean(vendorId);
      return (
        <div className="flex items-center gap-2">
          {hasLink ? (
            <Link
              href={`/vendors/${vendorId}`}
              className="flex items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <VendorIcon
                name={vendor}
                domain={vendorDomain}
                width={28}
                height={28}
              />
            </Link>
          ) : (
            <VendorIcon
              name={vendor}
              domain={vendorDomain}
              width={28}
              height={28}
            />
          )}
          {hasLink ? (
            <Link
              href={`/vendors/${vendorId}`}
              className="font-medium text-sm leading-tight underline-offset-2 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {vendor}
            </Link>
          ) : (
            <span className="font-medium text-sm">{vendor}</span>
          )}
        </div>
      );
    },
  },
];

export function CpmDocumentsList() {
  const { data, isLoading } = useQuery<ContractsListResponse>({
    queryKey: ['contracts', 'pending-uploads'],
    queryFn: () => apiClient.contracts.list({ status: 'all' }),
    staleTime: 30 * 1000,
    refetchInterval: (query) => {
      const contracts = query.state.data?.contracts;
      if (!contracts) return false;
      const hasPending = contracts.some((c) => c.contract.status_id !== 4);
      return hasPending ? 10_000 : false;
    },
  });

  const allUnpublished = useMemo((): PendingContract[] => {
    if (!data?.contracts) return [];
    return data.contracts
      .filter((c) => {
        if (c.contract.status_id === 4) return false;
        const contract = c.contract as unknown as Record<string, unknown>;
        if (contract.ai_extraction_status === 'h_failed') return false;
        if (contract.ai_extraction_status === 'ai_failed') {
          const errorCode = getFailureErrorCode(contract);
          return !!errorCode && USER_FACING_ERROR_CODES.has(errorCode);
        }
        return true;
      })
      .map((c) => {
        const { label, category, failureMessage } = getDisplayStatus(
          c.contract as unknown as Record<string, unknown>,
        );
        const contract = c.contract as Record<string, unknown>;
        const uploadedBy = contract.uploaded_by as
          | { name?: string; email?: string }
          | undefined;
        const vendors = contract.vendors as
          | { name?: string; domain?: string }
          | undefined;
        const contractTypes = contract.contract_types as
          | { name?: string }
          | undefined;
        return {
          id: c.contract.id,
          name: extractFileName(contract),
          uploadedBy: uploadedBy?.name || uploadedBy?.email || '',
          vendorId: c.vendor_id ?? null,
          vendor:
            c.vendor_name && c.vendor_name !== 'Unknown Vendor'
              ? c.vendor_name
              : vendors?.name || '',
          vendorDomain: vendors?.domain || '',
          documentType: contractTypes?.name || '',
          statusLabel: label,
          statusCategory: category,
          failureMessage,
          updatedAt:
            (contract.updated_at as string) ||
            (contract.created_at as string) ||
            '',
        };
      })
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }, [data?.contracts]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">
          Loading documents...
        </span>
      </div>
    );
  }

  if (allUnpublished.length === 0) return null;

  return (
    <div className="mt-8">
      <h3 className="mb-4">Pending Documents</h3>
      <DocumentsTable data={allUnpublished} columns={pendingColumns} />
    </div>
  );
}
