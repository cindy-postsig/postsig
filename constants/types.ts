import type { Database } from '@/database.types';
import type { ColumnLayoutStore } from '@/components/contracts/columnLayout';
import type { BaseCurrency } from '@/lib/base-currency';

export interface FetchContractsBaseOptions {
  contractFields?: string[];
  extendRange?: boolean;
  status?: ContractStatus;
}

export interface CommonError {
  errorMessage: string;
  statusCode?: number;
  errorData?: any;
}

export interface UserProfile {
  id: string;
  name: string | null;
  email: string | null;
  job_title: string | null;
  email_alerts: boolean | null;
  email_frequency: string | null;
  advance_notice_period: number | null;
  signed_up: boolean | null;
  contract_upload_notifications?: boolean | null;
  ftux_status?: Record<string, boolean> | null;
  /** User's chosen full date-fns pattern, or null to inherit the org default. */
  date_format?: string | null;
}

export interface ModuleInfo {
  code: string;
  name: string;
  basePath: string;
}

export interface UserMetadata {
  userId: string;
  userProfile: UserProfile | null;
  userRole: number;
  organizationId: string;
  organizationName: string | undefined;
  organizationFY: number | undefined;
  /** Effective date-fns pattern (user pattern resolved against org default). */
  dateFormat: string;
  /** Raw organization default date-fns pattern (before user resolution). */
  organizationDateFormat: string;
  /** Org base display currency for normalized amounts; managed by the admin app. */
  baseCurrency: BaseCurrency;
  /**
   * Per-user column order/visibility for configurable CPM list views.
   * Absent on metadata built outside a page request (e.g. MCP auth), where
   * there is no table to render.
   */
  columnLayouts?: ColumnLayoutStore;
  organizationMissingClauseSettings?: {
    settings: string[];
    isConfirmed: boolean;
  };
  appModules: ModuleInfo[];
  defaultModule?: ModuleInfo;
  isTrial: boolean | null | undefined;
  isPostsig?: boolean;
  isDemoOrg?: boolean;
  assistantEnabled?: boolean;
  cpmTrialEnabled: boolean;
  investorTrialEnabled: boolean;
  cpmMcpEnabled: boolean;
  investorMcpEnabled: boolean;
  cpmCsvExportEnabled?: boolean;
  investorCsvExportEnabled?: boolean;
  cpmInvoicesEnabled: boolean;
  cpmExchangeAgreementsEnabled: boolean;
  portcoKpisEnabled: boolean;
}

/** Raw `users` MFA columns, as the MFA trust gate reads them off the row. */
export interface MfaSessionState {
  mfa_enabled: boolean | null;
  mfa_type: string | null;
  mfa_last_verified_at: string | null;
  email_mfa_session_verified_at: string | null;
  email_mfa_session_id: string | null;
}

export interface MiddlewareMetadata {
  userRole: number;
  appModules: ModuleInfo[];
  defaultModule?: ModuleInfo;
  isTrial: boolean | null | undefined;
  cpmTrialEnabled: boolean;
  investorTrialEnabled: boolean;
  userProfile: { signed_up: boolean | null } | null;
  mfa: MfaSessionState;
}

/** Why an authenticated session is not allowed into the app. */
export type AccessDenialReason =
  | 'no-role'
  | 'role-not-permitted'
  | 'modules-revoked'
  | 'org-inactive';

/**
 * Outcome of the account access gate. `denied` is an authorization decision and
 * must fail closed; `error` is an infrastructure failure and must not be
 * treated as a denial.
 */
export type AccountAccessResult =
  | { status: 'ok'; metadata: MiddlewareMetadata }
  | { status: 'denied'; reason: AccessDenialReason }
  | { status: 'error' };

export interface PasswordResetState {
  email: string;
  recoveryTimestamp: number;
  completed: boolean;
}

type ContractStatus = 'unconfirmed' | 'active' | 'inactive';

export type MfaType = 'totp' | 'email' | null;

export interface FetchContractsParams {
  query?: string;
  currentPage?: number;
  contractFields?: string[];
  userId?: string;
  hideFailed?: boolean;
  contractStatus?: number;
  range?: number;
  extendRange?: boolean;
  status?: ContractStatus;
  myContractsOnly?: boolean;
  recentlyRenewed?: boolean;
  renewalType?: 'Auto' | 'Manual' | 'One-Time' | undefined;
  contractTypes?: number[];
  excludeContractTypeIds?: number[];
  reportType?: string;
  unexecutedOnly?: boolean;
  contractIds?: number[]; // Added to support filtering by specific contract IDs
  isPending?: boolean; // Flag to show pending contracts (status_id != 4)
  folderId?: string | null; // Filter contracts by folder ID
}

export interface FetchRenewingContractsParams {
  contractFields?: string[];
  daysAgo?: number;
  autoRenewalsOnly?: boolean;
}

export interface FetchRenewingContractsByUserRolesParams extends FetchRenewingContractsParams {
  userMetadata: UserMetadata;
}

export interface FetchContractsByUserRolesParams extends FetchContractsParams {
  userMetadata: UserMetadata;
  /**
   * Read the whole organization instead of the requester's ACL slice. Only the
   * base contract-set fetchers honour it: they populate one cache entry shared
   * by the org and resolve visibility per request on the way out.
   */
  orgWide?: boolean;
}

export interface FetchContractsByIdParams {
  ids: number[];
}

export interface FetchContractsByIdByUserRolesParams extends FetchContractsByIdParams {
  userMetadata: UserMetadata;
}

export interface FetchContractDocumentsByIdParams {
  id: number;
}

export interface FetchContractDocumentsByIdByUserRolesParams {
  id: number;
  userMetadata: UserMetadata;
}

export interface FetchVendorContractsParams {
  id: number;
  contractFields?: string[];
}

export interface FetchVendorContractsByUserRolesParams extends FetchVendorContractsParams {
  userMetadata: UserMetadata;
}

export interface FetchRelatedContractsParams {
  id: number;
  contractFields?: string[];
}

export interface FetchRelatedContractsByUserRolesParams extends FetchRelatedContractsParams {
  userMetadata: UserMetadata;
}

export interface FetchSingleVendorParams {
  id: number;
}

export interface FetchSingleVendorByUserRolesParams {
  id: number;
  userMetadata: UserMetadata;
}

export type ContractActiveStatus =
  | 'active'
  | 'inactive'
  | 'unconfirmed'
  | Array<'active' | 'inactive' | 'unconfirmed'>;

export interface FetchContractsPagesParams {
  query?: string;
  contractStatus?: number;
  contractActiveStatus?: ContractActiveStatus;
  hideFailed?: boolean;
}
export interface FetchContractsPagesByUserRolesParams extends FetchContractsPagesParams {
  userMetadata: UserMetadata;
}

export interface FetchContractsByDateRangeParams {
  startDate: string;
  endDate: string;
}

export interface FetchContractsByDateRangeByUserRolesParams extends FetchContractsByDateRangeParams {
  userMetadata: UserMetadata;
}

export interface FindVendorsParams {
  userId: string;
  column?: any;
  value?: any;
}

export interface FindVendorsByUserRolesParams extends FindVendorsParams {
  userMetadata: UserMetadata;
}

export interface FindVendorProductsDetailsForExtractorsParams {
  user_id: string;
  query?: { contract_id: number };
}

export const ITEMS_PER_PAGE = 50;

export interface Dates {
  date: string;
  updated_at: string;
  updated_by: string;
}

export type VendorProduct = {
  id: number;
  name: string;
};

export type BusinessGroup = {
  id: number;
  name: string;
};

export type OrgEmployee = Omit<
  Database['public']['Tables']['org_employees']['Row'],
  'status'
> & {
  status: 'active' | 'inactive' | 'on_leave';
  /** The business_group org-unit node on the employee's org_unit_id path. */
  businessGroup: BusinessGroup | null;
  deleted_at: string | null;
};

export type ContractUser = {
  id: number;
  name: string;
  email: string | null;
  product_id: number;
  vendor_products: VendorProduct | null;
  contract_id: number | null;
  created_at: string;
  updated_at: string | null;
  employee_id: string | null;
  region: string | null;
  country: string | null;
  division: string | null;
  department: string | null;
  cost_center: string | null;
  start_date: string | null;
  leave_date: string | null;
  org_employee_id: number | null;
  org_employees: OrgEmployee | null;
};

export type VendorProductUser = {
  id: number;
  product_id: number;
  contract_id: number;
  number_of_users: number;
  vendor_products: {
    id: number;
    name: string;
  };
};

export type VendorProductDetails = {
  id?: number;
  product_id?: number;
  contract_id: number;
  year: number;
  fees: number;
  vendor_products?: VendorProduct;
};

export interface DeleteVendorProductsDetailsForExtractorsParams {
  user_id: string;
  query?: { contract_id: number; product_id: number; year: number };
}

export interface FindVendorProductsDetailsForExtractorsParams {
  user_id: string;
  query?: { contract_id: number };
}

export interface LinkRelatedContractsForExtractorsParams {
  contractId: number;
  userId: string;
}

export interface UpdateContractForExtractorsParams {
  contractId: number;
  data: any;
}

export interface InsertVendorForExtractorsParams {
  name: string;
  address: string;
  user_id: string;
}

export interface UpdateVendorDataForExtractors {
  id: number | null;
  data: any;
  user_id: string;
}

export interface InsertVendorProductForExtractorsParams {
  data: any;
}

export interface FindVendorProductsForExtractorsParams {
  vendor_id: number;
  user_id: string;
}

export interface MiddlewareAccessDenied {
  from: string;
  exceptions?: string[];
  to: string;
  authenticated: boolean;
  condition?: (user: any) => boolean;
}

export enum ProcessType {
  New = 'new',
  Update = 'update',
}

export enum ModelProvider {
  openai = 'openai',
  google = 'google',
}

export type Citation = {
  id: string;
  content: Array<{
    id: string;
    pageNumber: number;
    citationText: string;
    boundingBox?: {
      top: number;
      left: number;
      width: number;
      height: number;
    };
  }>;
};

export interface Document {
  id: string;
  content: string;
  metadata: {
    pageNumber: number;
    totalPages: number;
    filename: string;
  };
}

export enum ContractActivityType {
  // Document Upload Related
  CONTRACT_UPLOADED = 'contract_uploaded',

  // Processing Status Changes (AI pipeline: New, In Progress, Needs Review, Published, Uploaded)
  STATUS_CHANGED = 'status_changed',

  // Contract Status Changes (Business status: active, inactive, unconfirmed)
  CONTRACT_STATUS_CHANGED = 'contract_status_changed',
  INVOICE_IMPORTED = 'invoice_imported',
  INVOICE_STATUS_CHANGED = 'invoice_status_changed',
  EXTERNAL_INVOICE_STATUS_CHANGED = 'external_invoice_status_changed',
  INVOICE_STATUS_SYNCED = 'invoice_status_synced',
  CONTRACT_AUTO_RENEWED = 'contract_auto_renewed',
  SUBSCRIPTION_TERM_CHANGED = 'subscription_term_changed',
  CONTRACT_DATES_UPDATED = 'contract_dates_updated', // For grouped date changes (end date, cancel by date, etc.)

  // Contract Assignments
  OWNER_CHANGED = 'owner_changed',
  USER_CHANGED = 'user_changed',
  USER_ADDED = 'user_added',

  // Contract Confirmation
  CONTRACT_UNCONFIRMED = 'contract_unconfirmed',
  CONTRACT_CONFIRMED = 'contract_confirmed',

  // Will Not Renew
  WILL_NOT_RENEW = 'will_not_renew',

  // Contract Sharing
  CONTRACT_SHARED = 'contract_shared',
  CONTRACT_UNSHARED = 'contract_unshared',
  FOLDER_SHARED = 'folder_shared',
  FOLDER_UNSHARED = 'folder_unshared',

  // Folder Assignment
  CONTRACT_FOLDER_ASSIGNED = 'contract_folder_assigned',
  FOLDER_RENAMED = 'folder_renamed',

  // Executed contract upload
  EXECUTED_CONTRACT_UPLOADED = 'executed_contract_uploaded',

  // Contract Editing
  CONTRACT_EDITED = 'contract_edited',
  CONTRACT_FIELD_REVERTED = 'contract_field_reverted',

  // Product Editing
  PRODUCT_EDITED = 'product_edited',
  PRODUCT_FIELD_REVERTED = 'product_field_reverted',

  // Cost Allocation
  ALLOCATION_CHANGED = 'allocation_changed',

  // Document Translation
  DOCUMENT_TRANSLATED = 'document_translated',
  DOCUMENT_TRANSLATION_QUOTA_EXCEEDED = 'document_translation_quota_exceeded',
}

export enum UserActivityType {
  VENDOR_WHITELIST_UPLOADED = 'vendor_whitelist_uploaded',
}

export enum InvestorActivityType {
  // Document lifecycle
  DOCUMENT_UPLOADED = 'investor_document_uploaded',
  DOCUMENT_PROCESSED = 'investor_document_processed',
  DOCUMENT_CREATED = 'investor_document_created',

  // AI extraction events
  DOCUMENT_TYPE_DETECTED = 'investor_document_type_detected',
  EXTRACTION_COMPLETED = 'investor_extraction_completed',
  EXTRACTION_FAILED = 'investor_extraction_failed',

  // Company events
  COMPANY_MATCHED = 'investor_company_matched',
  COMPANY_CREATED = 'investor_company_created',
  ENTITY_LINKED = 'investor_entity_linked',

  // Fund events
  FUND_MATCHED = 'investor_fund_matched',
  FUND_CREATED = 'investor_fund_created',
  FUND_LINKED = 'investor_fund_linked',

  // Rerun events
  EXTRACTION_RERUN_REQUESTED = 'investor_extraction_rerun_requested',

  // Value override events
  VALUE_OVERRIDE_CREATED = 'investor_value_override_created',
  VALUE_OVERRIDE_REVERTED = 'investor_value_override_reverted',

  // Investor status create-on-edit
  INVESTOR_STATUS_RECORD_CREATED = 'investor_status_record_created',

  // Board seat lifecycle
  BOARD_SEAT_ADDED = 'investor_board_seat_added',
  BOARD_SEAT_REMOVED = 'investor_board_seat_removed',
}

export interface ProcessingStatusChangeActivityData {
  oldStatusId?: number;
  newStatusId: number;
  reason?: string;
  changedBy?: string;
}

export interface ContractStatusChangeActivityData {
  oldStatus?: string;
  newStatus: string;
  reason?: string;
  changedBy?: string;
}

export interface InvoiceIntegrationStatusActivityData {
  event: 'external_invoice_status_changed' | 'invoice_status_updated';
  contract_id: number;
  external_invoice_id?: string | null;
  external_status_old?: string | null;
  external_status_new?: string | null;
  invoice_status_old?: string | null;
  invoice_status_new?: string | null;
  provider?: string | null;
  syncType?: string | null;
  syncStatus?: string | null;
  syncLogId?: number | string | null;
  reason?: string | null;
  actor_name?: string | null;
}

export interface InvoiceImportedActivityData {
  provider: string;
  external_invoice_id?: string | null;
  external_invoice_status?: string | null;
}

interface ContractUploadedActivityData {
  fileName?: string;
  changedBy?: string;
}

export interface DocumentTranslatedActivityData {
  fileName?: string;
  language?: string;
  translatedPath?: string;
  billedCharacters?: number;
}

export interface DocumentTranslationQuotaExceededActivityData {
  fileName?: string;
  language?: string;
  service?: string;
  reason?: string;
}

interface ContractAutoRenewedActivityData {
  renewalPeriod?: string;
  changedBy?: string;
}

interface SubscriptionTermChangedActivityData {
  oldTerm?: string;
  newTerm: string;
  changedBy?: string;
}

interface ContractDatesUpdatedActivityData {
  updatedFields: Array<{
    fieldName: string;
    oldValue?: string;
    newValue: string;
  }>;
  changedBy?: string;
}

interface OwnerChangedActivityData {
  action: 'added' | 'removed';
  ownerName?: string;
  ownerGroup?: string;
  changedBy?: string;
}

interface UserChangedActivityData {
  action: 'added' | 'removed' | 'released';
  userName?: string; // For single user operations
  userNames?: string[]; // For bulk operations
  productIds?: number[]; // Product IDs involved
  changedBy?: string;
}

interface ContractUnconfirmedActivityData {
  reason?: string;
  changedBy?: string;
}

interface ContractConfirmedActivityData {
  changedBy?: string;
}

interface WillNotRenewActivityData {
  changedBy?: string;
  reason?: string;
  status: boolean;
}

interface ContractSharedActivityData {
  sharedWith: Array<{
    type: 'user' | 'group';
    id: string | number;
    name: string;
    email?: string;
    permissionLevel: 'read' | 'write' | 'admin';
  }>;
  changedBy?: string;
  reason?: string;
}

interface ContractUnsharedActivityData {
  unsharedFrom: Array<{
    type: 'user' | 'group';
    id: string | number;
    name: string;
    email?: string;
  }>;
  changedBy?: string;
  reason?: string;
}

interface FolderSharedActivityData {
  folderId: number;
  folderName: string;
  sharedWith: Array<{
    type: 'user' | 'group';
    id: string | number;
    name: string;
    email?: string;
    permissionLevel: 'read' | 'write' | 'admin';
  }>;
  changedBy?: string;
  reason?: string;
}

interface FolderUnsharedActivityData {
  folderId: number;
  folderName: string;
  unsharedFrom: Array<{
    type: 'user' | 'group';
    id: string | number;
    name: string;
    email?: string;
  }>;
  changedBy?: string;
  reason?: string;
}

interface ContractFolderAssignedActivityData {
  action: 'added' | 'removed' | 'reassigned';
  folderId?: number;
  folderName?: string;
  oldFolderId?: number;
  oldFolderName?: string;
  newFolderId?: number;
  newFolderName?: string;
  changedBy?: string;
}

interface FolderRenamedActivityData {
  folderId: number;
  oldName: string;
  newName: string;
  changedBy?: string;
}

export interface FieldsEditedActivityData {
  versionId: number;
  changeCount: number;
  changedFields: Array<{
    table: string;
    recordId: number;
    fieldKey: string;
    fieldTitle: string;
    oldValue: string | number | null;
    newValue: string | number | null;
    metadata?: { productName?: string; year?: number };
  }>;
}

export interface FieldRevertedActivityData {
  table: string;
  recordId: number;
  fieldKey: string;
  fieldTitle: string;
  revertedFrom: string | number | null;
  revertedTo: string | number | null;
  productName?: string;
}

/** @deprecated Use FieldsEditedActivityData instead */
export type ContractEditedActivityData = FieldsEditedActivityData;
/** @deprecated Use FieldRevertedActivityData instead */
export type ContractFieldRevertedActivityData = FieldRevertedActivityData;
/** @deprecated Use FieldsEditedActivityData instead */
export type ProductEditedActivityData = FieldsEditedActivityData;
/** @deprecated Use FieldRevertedActivityData instead */
export type ProductFieldRevertedActivityData = FieldRevertedActivityData;

interface VendorWhitelistUploadedActivityData {
  totalEntries: number;
  added: number;
  updated: number;
  replaced: boolean;
  skippedInvalid: number;
  skippedDuplicates: number;
  changedBy?: string;
}

// Investor module activity data interfaces
export interface InvestorDocumentUploadedActivityData {
  fileName: string;
  fileType: string;
  fileSize: number;
  filePath: string;
}

export interface InvestorDocumentProcessedActivityData {
  fileName: string;
  isZip: boolean;
  extractedFileCount?: number;
  skippedFileCount?: number;
  sanitized?: boolean;
}

export interface InvestorDocumentCreatedActivityData {
  moduleDocumentId: number;
  fileName: string;
}

export interface InvestorDocumentTypeDetectedActivityData {
  moduleDocumentId: number;
  documentType: string;
  confidence?: number;
}

export interface InvestorExtractionCompletedActivityData {
  moduleDocumentId: number;
  documentType: string;
  fieldCount?: number;
}

export interface InvestorExtractionFailedActivityData {
  moduleDocumentId: number;
  error: string;
  stage: string;
}

export interface InvestorCompanyMatchedActivityData {
  moduleDocumentId: number;
  companyId: number;
  companyName: string;
  matchType: 'exact' | 'partial' | 'fuzzy';
  similarity?: number;
}

export interface InvestorCompanyCreatedActivityData {
  moduleDocumentId: number;
  companyId: number;
  companyName: string;
}

export interface InvestorEntityLinkedActivityData {
  moduleDocumentId: number;
  entityId: number | null;
  companyId: number;
}

export interface InvestorFundMatchedActivityData {
  moduleDocumentId: number;
  fundId: number;
  fundName: string;
  matchType: 'exact' | 'partial' | 'fuzzy';
}

export interface InvestorFundCreatedActivityData {
  moduleDocumentId: number;
  fundId: number;
  fundName: string;
}

export interface InvestorFundLinkedActivityData {
  moduleDocumentId: number;
  fundId: number;
  entityId: number;
}

export interface InvestorExtractionRerunRequestedActivityData {
  moduleDocumentId?: number;
  statusIds?: number[];
  documentCount: number;
}

export interface InvestorValueOverrideCreatedActivityData {
  entityType: string;
  entityId: number;
  fieldKey: string;
  originalValue: unknown;
  overrideValue: unknown;
  reason: string;
}

export interface InvestorValueOverrideRevertedActivityData {
  overrideId: string;
}

export interface InvestorStatusRecordCreatedActivityData {
  companyId: number;
  financingRoundId: number;
  effectiveDate: string;
  /** The flags set when the source rows were created (all newly turned on). */
  changes: Array<{
    entityType: 'inv_information_rights' | 'inv_round_terms';
    fieldKey: string;
    value: boolean;
  }>;
  reason?: string;
}

export interface InvestorBoardSeatAddedActivityData {
  seatId: number;
  companyId: number;
  holderName: string;
  holderTitle: string | null;
  seatType: string;
  designatingFundId: number | null;
  reason: string;
}

export interface InvestorBoardSeatRemovedActivityData {
  seatId: number;
  companyId: number;
  holderName: string;
  seatType: string;
  reason: string;
}

export interface AllocationActivityLine {
  orgUnitId: number | null;
  orgEmployeeId: number | null;
  percent: number;
  /** Resolved for display when the History tab loads; never stored. */
  targetName?: string;
}

export interface AllocationActivityScope {
  /** null = whole-contract scope */
  productId: number | null;
  mode: 'active_users' | 'manual';
  lines: AllocationActivityLine[];
  /** Resolved for display when the History tab loads; never stored. */
  productName?: string;
}

export interface AllocationChangedActivityData {
  before: AllocationActivityScope[];
  after: AllocationActivityScope[];
  changedBy?: string;
}

export type ActivityData =
  | ProcessingStatusChangeActivityData
  | ContractStatusChangeActivityData
  | InvoiceImportedActivityData
  | InvoiceIntegrationStatusActivityData
  | ContractUploadedActivityData
  | ContractAutoRenewedActivityData
  | SubscriptionTermChangedActivityData
  | ContractDatesUpdatedActivityData
  | OwnerChangedActivityData
  | UserChangedActivityData
  | ContractUnconfirmedActivityData
  | ContractConfirmedActivityData
  | WillNotRenewActivityData
  | ContractSharedActivityData
  | ContractUnsharedActivityData
  | FolderSharedActivityData
  | FolderUnsharedActivityData
  | ContractFolderAssignedActivityData
  | FolderRenamedActivityData
  | ContractEditedActivityData
  | ContractFieldRevertedActivityData
  | ProductEditedActivityData
  | ProductFieldRevertedActivityData
  | AllocationChangedActivityData
  | DocumentTranslatedActivityData
  | DocumentTranslationQuotaExceededActivityData
  | VendorWhitelistUploadedActivityData
  | InvestorDocumentUploadedActivityData
  | InvestorDocumentProcessedActivityData
  | InvestorDocumentCreatedActivityData
  | InvestorDocumentTypeDetectedActivityData
  | InvestorExtractionCompletedActivityData
  | InvestorExtractionFailedActivityData
  | InvestorCompanyMatchedActivityData
  | InvestorCompanyCreatedActivityData
  | InvestorEntityLinkedActivityData
  | InvestorFundMatchedActivityData
  | InvestorFundCreatedActivityData
  | InvestorFundLinkedActivityData
  | InvestorExtractionRerunRequestedActivityData
  | InvestorValueOverrideCreatedActivityData
  | InvestorStatusRecordCreatedActivityData
  | InvestorValueOverrideRevertedActivityData
  | InvestorBoardSeatAddedActivityData
  | InvestorBoardSeatRemovedActivityData;

// Type map to link activity types to their data structures
type ActivityDataMap = {
  [ContractActivityType.STATUS_CHANGED]: ProcessingStatusChangeActivityData;
  [ContractActivityType.CONTRACT_STATUS_CHANGED]: ContractStatusChangeActivityData;
  [ContractActivityType.INVOICE_IMPORTED]: InvoiceImportedActivityData;
  [ContractActivityType.INVOICE_STATUS_CHANGED]: ContractStatusChangeActivityData;
  [ContractActivityType.EXTERNAL_INVOICE_STATUS_CHANGED]: InvoiceIntegrationStatusActivityData;
  [ContractActivityType.INVOICE_STATUS_SYNCED]: InvoiceIntegrationStatusActivityData;
  [ContractActivityType.CONTRACT_UPLOADED]: ContractUploadedActivityData;
  [ContractActivityType.CONTRACT_AUTO_RENEWED]: ContractAutoRenewedActivityData;
  [ContractActivityType.SUBSCRIPTION_TERM_CHANGED]: SubscriptionTermChangedActivityData;
  [ContractActivityType.CONTRACT_DATES_UPDATED]: ContractDatesUpdatedActivityData;
  [ContractActivityType.OWNER_CHANGED]: OwnerChangedActivityData;
  [ContractActivityType.USER_CHANGED]: UserChangedActivityData;
  [ContractActivityType.CONTRACT_UNCONFIRMED]: ContractUnconfirmedActivityData;
  [ContractActivityType.CONTRACT_CONFIRMED]: ContractConfirmedActivityData;
  [ContractActivityType.WILL_NOT_RENEW]: WillNotRenewActivityData;
  [ContractActivityType.CONTRACT_SHARED]: ContractSharedActivityData;
  [ContractActivityType.CONTRACT_UNSHARED]: ContractUnsharedActivityData;
  [ContractActivityType.FOLDER_SHARED]: FolderSharedActivityData;
  [ContractActivityType.FOLDER_UNSHARED]: FolderUnsharedActivityData;
  [ContractActivityType.CONTRACT_FOLDER_ASSIGNED]: ContractFolderAssignedActivityData;
  [ContractActivityType.FOLDER_RENAMED]: FolderRenamedActivityData;
  [ContractActivityType.USER_ADDED]: UserChangedActivityData;
  [ContractActivityType.EXECUTED_CONTRACT_UPLOADED]: ContractUploadedActivityData;
  [ContractActivityType.CONTRACT_EDITED]: ContractEditedActivityData;
  [ContractActivityType.CONTRACT_FIELD_REVERTED]: ContractFieldRevertedActivityData;
  [ContractActivityType.PRODUCT_EDITED]: ProductEditedActivityData;
  [ContractActivityType.PRODUCT_FIELD_REVERTED]: ProductFieldRevertedActivityData;
  [ContractActivityType.ALLOCATION_CHANGED]: AllocationChangedActivityData;
  [ContractActivityType.DOCUMENT_TRANSLATED]: DocumentTranslatedActivityData;
  [ContractActivityType.DOCUMENT_TRANSLATION_QUOTA_EXCEEDED]: DocumentTranslationQuotaExceededActivityData;
  [UserActivityType.VENDOR_WHITELIST_UPLOADED]: VendorWhitelistUploadedActivityData;
  // Investor module activity types
  [InvestorActivityType.DOCUMENT_UPLOADED]: InvestorDocumentUploadedActivityData;
  [InvestorActivityType.DOCUMENT_PROCESSED]: InvestorDocumentProcessedActivityData;
  [InvestorActivityType.DOCUMENT_CREATED]: InvestorDocumentCreatedActivityData;
  [InvestorActivityType.DOCUMENT_TYPE_DETECTED]: InvestorDocumentTypeDetectedActivityData;
  [InvestorActivityType.EXTRACTION_COMPLETED]: InvestorExtractionCompletedActivityData;
  [InvestorActivityType.EXTRACTION_FAILED]: InvestorExtractionFailedActivityData;
  [InvestorActivityType.COMPANY_MATCHED]: InvestorCompanyMatchedActivityData;
  [InvestorActivityType.COMPANY_CREATED]: InvestorCompanyCreatedActivityData;
  [InvestorActivityType.ENTITY_LINKED]: InvestorEntityLinkedActivityData;
  [InvestorActivityType.FUND_MATCHED]: InvestorFundMatchedActivityData;
  [InvestorActivityType.FUND_CREATED]: InvestorFundCreatedActivityData;
  [InvestorActivityType.FUND_LINKED]: InvestorFundLinkedActivityData;
  [InvestorActivityType.EXTRACTION_RERUN_REQUESTED]: InvestorExtractionRerunRequestedActivityData;
  [InvestorActivityType.VALUE_OVERRIDE_CREATED]: InvestorValueOverrideCreatedActivityData;
  [InvestorActivityType.INVESTOR_STATUS_RECORD_CREATED]: InvestorStatusRecordCreatedActivityData;
  [InvestorActivityType.VALUE_OVERRIDE_REVERTED]: InvestorValueOverrideRevertedActivityData;
  [InvestorActivityType.BOARD_SEAT_ADDED]: InvestorBoardSeatAddedActivityData;
  [InvestorActivityType.BOARD_SEAT_REMOVED]: InvestorBoardSeatRemovedActivityData;
};

export function getActivityDataType<
  T extends ContractActivityType | UserActivityType | InvestorActivityType,
>(activityType: T): ActivityDataMap[T] {
  switch (activityType) {
    case ContractActivityType.CONTRACT_UPLOADED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.STATUS_CHANGED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.CONTRACT_STATUS_CHANGED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.INVOICE_IMPORTED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.INVOICE_STATUS_CHANGED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.EXTERNAL_INVOICE_STATUS_CHANGED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.INVOICE_STATUS_SYNCED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.CONTRACT_AUTO_RENEWED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.SUBSCRIPTION_TERM_CHANGED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.CONTRACT_DATES_UPDATED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.OWNER_CHANGED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.USER_CHANGED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.CONTRACT_UNCONFIRMED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.CONTRACT_CONFIRMED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.WILL_NOT_RENEW:
      return {} as ActivityDataMap[T];
    case ContractActivityType.CONTRACT_SHARED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.CONTRACT_UNSHARED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.FOLDER_SHARED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.FOLDER_UNSHARED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.CONTRACT_FOLDER_ASSIGNED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.FOLDER_RENAMED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.EXECUTED_CONTRACT_UPLOADED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.CONTRACT_EDITED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.CONTRACT_FIELD_REVERTED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.PRODUCT_EDITED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.PRODUCT_FIELD_REVERTED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.ALLOCATION_CHANGED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.DOCUMENT_TRANSLATED:
      return {} as ActivityDataMap[T];
    case ContractActivityType.DOCUMENT_TRANSLATION_QUOTA_EXCEEDED:
      return {} as ActivityDataMap[T];
    case UserActivityType.VENDOR_WHITELIST_UPLOADED:
      return {} as ActivityDataMap[T];
    // Investor module activity types
    case InvestorActivityType.DOCUMENT_UPLOADED:
      return {} as ActivityDataMap[T];
    case InvestorActivityType.DOCUMENT_PROCESSED:
      return {} as ActivityDataMap[T];
    case InvestorActivityType.DOCUMENT_CREATED:
      return {} as ActivityDataMap[T];
    case InvestorActivityType.DOCUMENT_TYPE_DETECTED:
      return {} as ActivityDataMap[T];
    case InvestorActivityType.EXTRACTION_COMPLETED:
      return {} as ActivityDataMap[T];
    case InvestorActivityType.EXTRACTION_FAILED:
      return {} as ActivityDataMap[T];
    case InvestorActivityType.COMPANY_MATCHED:
      return {} as ActivityDataMap[T];
    case InvestorActivityType.COMPANY_CREATED:
      return {} as ActivityDataMap[T];
    case InvestorActivityType.ENTITY_LINKED:
      return {} as ActivityDataMap[T];
    case InvestorActivityType.FUND_MATCHED:
      return {} as ActivityDataMap[T];
    case InvestorActivityType.FUND_CREATED:
      return {} as ActivityDataMap[T];
    case InvestorActivityType.FUND_LINKED:
      return {} as ActivityDataMap[T];
    case InvestorActivityType.EXTRACTION_RERUN_REQUESTED:
      return {} as ActivityDataMap[T];
    default:
      return {} as ActivityDataMap[T];
  }
}

export interface LogContractActivityParams<T extends ActivityData> {
  contractId?: number;
  activityType: ContractActivityType | UserActivityType | string;
  activityData: T;
  userId?: string;
}

export interface LogInvestorActivityParams<T extends ActivityData> {
  entityId?: number;
  activityType: InvestorActivityType;
  activityData: T;
  userId?: string;
}

export type UserRole =
  | 'Admin'
  | 'Manager'
  | 'Viewer'
  | 'PostSig Admin'
  | 'PostSig Reviewer'
  | 'PostSig Extractor';

export type UserRoleWithoutOld = 'Admin' | 'Manager' | 'Viewer';

export type ProcessingStatus =
  | 'ready'
  | 'uploading'
  | 'verifying'
  | 'uploaded'
  | 'failed';
