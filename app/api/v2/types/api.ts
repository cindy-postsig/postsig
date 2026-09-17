import type { InventoryItem } from '@/lib/v2/inventory/types';
import type { EnrichedContract } from '@/lib/v2/contracts/service';
import type {
  ContractActivity,
  ActivitiesResult,
} from '@/lib/v2/contracts/activities';
import type {
  ContractDocument,
  DocumentsResult,
  ContractVersion,
  LatestVersionResult,
} from '@/lib/v2/contracts/documents';
import type { Citation, CitationsResult } from '@/lib/v2/contracts/citations';
import type {
  AmendmentContract,
  AmendmentChainResult,
} from '@/lib/v2/contracts/amendments';
import type { ContractACLResult } from '@/lib/v2/contracts/acl';
import type {
  VendorWhitelistEntry,
  VendorWhitelist,
} from '@/lib/v2/organization-preferences/types';
import type {
  PendingChanges,
  FieldChange,
  SaveContractEditsResult,
} from '@/lib/v2/contracts/edit/types';

export interface ProductDetailsRow {
  id: number;
  product_id: number;
  contract_id: number;
  year: number;
  fees: number;
  start_date: string;
  end_date: string;
}
export interface ProductsListResponse {
  products: Array<{
    id: number;
    name: string;
    vendor_id: number;
    details: Array<{
      id: number;
      product_id: number;
      contract_id: number;
      year: number;
      fees: number;
      start_date: string;
      end_date: string;
    }>;
  }>;
  count: number;
}

export interface ProductResponse {
  id: number;
  name: string;
  vendor_id: number;
}

export interface ApiError {
  error: string;
  details?: unknown;
}

export interface InventoryListResponse {
  items: InventoryItem[];
  count: number;
}

export interface ContractsListResponse {
  contracts: EnrichedContract[];
  count: number;
}

// Raw contract from fetchContractsById - has nested relations
// EnrichedContract is for list views with pricing enrichment
export interface ContractResponse {
  contract: Record<string, any>;
}

export interface ContractGroup {
  id: number;
  name: string;
  publicUuid: string;
}

export interface ContractGroupsResponse {
  groups: ContractGroup[];
}

/** A `business_group` org-unit node — the employee-facing business group. */
export interface OrgBusinessGroupNode {
  id: number;
  name: string;
}

export interface OrgBusinessGroupsResponse {
  groups: OrgBusinessGroupNode[];
}

export interface VendorWhitelistResponse {
  whitelist: VendorWhitelist;
}

export interface VendorWhitelistUploadResponse {
  whitelist: VendorWhitelist;
  summary: {
    total: number;
    added: number;
    updated: number;
    replaced: boolean;
  };
}

export interface VendorWhitelistBulkResponse {
  whitelist: VendorWhitelist;
  summary: {
    added: number;
    updated: number;
  };
}

export type { VendorWhitelistEntry, VendorWhitelist };

export interface PostsigEmailAddressResponse {
  preference: boolean;
  postsigEmailAddress: string;
}

// Contract editing types
export interface SaveContractEditsRequest {
  changes: PendingChanges;
}

export interface RevertContractFieldRequest {
  fieldKey: string;
  targetValue: string | null;
}

export type { PendingChanges, FieldChange, SaveContractEditsResult };

export interface ProcessContractResponse {
  contractId?: number;
}

export interface ContractFolder {
  id: number;
  name: string;
  publicUuid: string;
}

export interface ContractFoldersResponse {
  folders: ContractFolder[];
}

export interface User {
  id: number;
  email: string;
  name: string;
}

export interface OrgUsersResponse {
  users: User[];
}

export interface ContractTag {
  id: number;
  name: string;
}

export interface ContractTagsResponse {
  tags: ContractTag[];
}

export interface ObjectTag {
  id: number;
  name: string;
}

export interface EntityTagsResponse {
  tags: string[];
}

// Contract detail types
export type { ContractActivity, ActivitiesResult };
export type { ContractDocument, DocumentsResult };
export type { ContractVersion, LatestVersionResult };
export type { Citation, CitationsResult };
export type { AmendmentContract, AmendmentChainResult };
export type { ContractACLResult };
// Chat persistence types
export type {
  ChatSession,
  ChatMessage,
  ChatMessageMetadata,
  ChatSessionsResult,
  ChatMessagesResult,
  CreateSessionResult,
} from '@/lib/v2/chat/persistence';

// Chat welcome types
export type {
  WelcomeData,
  WelcomeDataResponse,
  ExpiringContractsData,
  RecentUploadsData,
  TopVendorData,
} from '@/lib/v2/chat/welcome';

// Investor/Venture types
export type {
  VentureDocumentSummary,
  VentureDocumentSummaryResult,
  VentureDocumentsResult,
  VentureDocumentRow,
} from '@/lib/v2/investor/service';

// Archive types
export type {
  ModuleArchiveRow,
  ModuleArchivesResult,
} from '@/lib/v2/archives/service';
