import type {
  ProductsListResponse,
  InventoryListResponse,
  ContractsListResponse,
  ContractResponse,
  ContractGroupsResponse,
  OrgBusinessGroupsResponse,
  ApiError,
  PostsigEmailAddressResponse,
  PendingChanges,
  SaveContractEditsResult,
  ProcessContractResponse,
  ContractFoldersResponse,
  OrgUsersResponse,
  ContractTagsResponse,
  EntityTagsResponse,
  ActivitiesResult,
  DocumentsResult,
  LatestVersionResult,
  CitationsResult,
  AmendmentChainResult,
  ContractACLResult,
  ChatSessionsResult,
  ChatMessagesResult,
  CreateSessionResult,
  WelcomeDataResponse,
  VentureDocumentSummaryResult,
  ModuleArchivesResult,
} from '@/app/api/v2/types/api';
import type { EmployeeImportMapping } from '@/lib/v2/employee-import/types';
import type {
  PreviewResponse as EmployeeImportPreviewResponse,
  CommitResponse as EmployeeImportCommitResponse,
} from '@/lib/v2/employee-import/service';
import type { ReportData, ReportSummary } from '@/lib/v2/reports/service';
import type {
  CompanyCustomKpi,
  CustomKpiUsage,
  KpiEvent,
  PortcoUserOption,
  ReportingRequestDetails,
  RequestRecipient,
  StandardKpiOverride,
} from '@/lib/v2/kpis/types';
import type { CreateReportingRequestInput } from '@/lib/v2/kpis/requests';
import type {
  CreateCustomKpiInput,
  SetKpiValueInput,
} from '@/lib/v2/kpis/custom-kpis';
import type { CalendarResult } from '@/lib/v2/calendar/service';
import type {
  SpendQueryInput,
  SpendQueryResponse,
} from '@/app/api/v2/handlers/spend/query';
import type { AssignmentsPayloadResponse } from '@/app/api/v2/handlers/assignments/payload';
import type {
  AllocationCatalogData,
  CostAllocationTabPayload,
  SaveAllocationBudgetInput,
} from '@/app/api/v2/handlers/cost-allocation';
import type { AllocationScopeInput } from '@/lib/v2/cost-allocation/service';
import type { CreateBusinessGroupResponse } from '@/app/api/v2/handlers/org-units';
import type { OwnersCatalogData } from '@/lib/v2/owners/catalog';
import type { SaveContractOwnersBody } from '@/app/api/v2/handlers/contracts/owners';
import type {
  InvPortfolioCompanyResult,
  InvPortfolioCompaniesResult,
} from '@/lib/v2/inv/service';
import type { InvFundsResult } from '@/lib/v2/inv/types';
import { ModelProvider } from '@/constants/types';

export class ApiRequestError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.details = details;
  }
}

class V2ApiClient {
  private baseUrl = '/api/v2';

  private async request<T>(
    endpoint: string,
    options?: RequestInit,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!res.ok) {
      let errorBody: ApiError | unknown;
      try {
        errorBody = await res.json();
      } catch {
        errorBody = { error: res.statusText || 'Unknown error' };
      }

      const apiError = errorBody as ApiError;
      const message = apiError?.error || `HTTP ${res.status}`;
      const details = apiError?.details ?? errorBody;

      throw new ApiRequestError(res.status, message, details);
    }

    return res.json();
  }

  /**
   * Multipart uploads cannot go through `request`, which forces a JSON
   * Content-Type and would strip the multipart boundary.
   */
  private async uploadForm<T>(
    endpoint: string,
    formData: FormData,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });

    if (!res.ok) {
      let errorBody: { error?: string; details?: unknown };
      try {
        errorBody = await res.json();
      } catch {
        errorBody = { error: res.statusText || 'Unknown error' };
      }

      throw new ApiRequestError(
        res.status,
        errorBody.error || `HTTP ${res.status}`,
        errorBody.details,
      );
    }

    return res.json();
  }

  products = {
    list: () => this.request<ProductsListResponse>('/products'),
  };

  inventory = {
    list: () => this.request<InventoryListResponse>('/inventory'),
  };

  contracts = {
    list: (params?: { status?: 'active' | 'all' }) => {
      const query = params?.status ? `?status=${params.status}` : '';
      return this.request<ContractsListResponse>(`/contracts${query}`);
    },
    get: (id: number) => this.request<ContractResponse>(`/contracts/${id}`),
    process: (payload: {
      fileName: string;
      modelProvider: ModelProvider;
      processType: string;
    }) =>
      this.request<ProcessContractResponse>('/contracts/process-contract', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getActivities: (id: number) =>
      this.request<ActivitiesResult>(`/contracts/${id}/activities`),
    getDocuments: (id: number) =>
      this.request<DocumentsResult>(`/contracts/${id}/documents`),
    getVersions: (id: number) =>
      this.request<LatestVersionResult>(`/contracts/${id}/versions`),
    getCitations: (id: number) =>
      this.request<CitationsResult>(`/contracts/${id}/citations`),
    getAmendments: (id: number) =>
      this.request<AmendmentChainResult>(`/contracts/${id}/amendments`),
    getACL: (id: number) =>
      this.request<ContractACLResult>(`/contracts/${id}/acl`),
    uploadVersion: (
      contractId: number,
      payload: { filePath: string; fileName: string; description?: string },
    ) =>
      this.request<{ success: boolean }>(`/contracts/${contractId}/versions`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    saveEdits: (contractId: number, changes: PendingChanges) =>
      this.request<SaveContractEditsResult>(`/contracts/${contractId}/edits`, {
        method: 'POST',
        body: JSON.stringify({ changes }),
      }),
    processZip: (payload: {
      fileName: string;
      filePath: string;
      fileSize: number;
    }) =>
      this.request<{ success: boolean }>('/contracts/process-zip', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    verifyZipUpload: (payload: { fileName: string }) =>
      this.request<{
        exists: boolean;
        existingSize?: number;
        existingNames: string[];
      }>('/contracts/verify-zip-upload', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    revertField: (
      contractId: number,
      fieldKey: string,
      targetValue: string | null,
    ) =>
      this.request<SaveContractEditsResult>(
        `/contracts/${contractId}/revert-field`,
        {
          method: 'POST',
          body: JSON.stringify({ fieldKey, targetValue }),
        },
      ),
    updateContract: (contractId: number, data: any) =>
      this.request<{ success: boolean }>(`/contracts/${contractId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    ownersCatalog: () =>
      this.request<OwnersCatalogData>('/contracts/owners/catalog'),
    saveOwners: (contractId: number, input: SaveContractOwnersBody) =>
      this.request<{ success: boolean }>(`/contracts/${contractId}/owners`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
  };

  reports = {
    get: (type: string, options?: { activeTab?: string }) => {
      const params = new URLSearchParams();
      if (options?.activeTab) params.set('activeTab', options.activeTab);
      const query = params.toString() ? `?${params.toString()}` : '';
      return this.request<ReportData>(`/reports/${type}${query}`);
    },
    getSummary: (type: string) =>
      this.request<ReportSummary>(`/reports/${type}/summary`),
    getSummaries: (types: string[]) =>
      this.request<Record<string, ReportSummary>>(
        `/reports/summaries?types=${types.join(',')}`,
      ),
  };

  spend = {
    query: (input: SpendQueryInput) =>
      this.request<SpendQueryResponse>('/spend', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  };

  assignments = {
    payload: (month: string) =>
      this.request<AssignmentsPayloadResponse>(
        `/assignments?month=${encodeURIComponent(month)}`,
      ),
  };

  calendar = {
    list: (range?: { start: string; end: string }) => {
      const params = new URLSearchParams();
      if (range) {
        params.set('start', range.start);
        params.set('end', range.end);
      }
      const query = params.toString() ? `?${params.toString()}` : '';
      return this.request<CalendarResult>(`/calendar${query}`);
    },
  };

  folders = {
    updateContractFolders: (contractId: number, folderIds: number[]) =>
      this.request<{ success: boolean }>(`/folders/contract/${contractId}`, {
        method: 'PUT',
        body: JSON.stringify({ folderIds }),
      }),
    getOrgFolders: (orgId: string) =>
      this.request<ContractFoldersResponse>(`/folders/org/${orgId}`),
  };

  costAllocation = {
    tab: (contractId: number) =>
      this.request<CostAllocationTabPayload>(
        `/cost-allocation/contracts/${contractId}`,
      ),
    catalog: () =>
      this.request<AllocationCatalogData>('/cost-allocation/catalog'),
    saveAllocation: (contractId: number, scopes: AllocationScopeInput[]) =>
      this.request<{ success: boolean }>(
        `/cost-allocation/contracts/${contractId}`,
        { method: 'PUT', body: JSON.stringify({ scopes }) },
      ),
    saveBudget: (input: SaveAllocationBudgetInput) =>
      this.request<{ success: boolean }>('/cost-allocation/budgets', {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
  };

  orgUnits = {
    createBusinessGroup: (name: string) =>
      this.request<CreateBusinessGroupResponse>('/org-units/business-groups', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
  };

  groups = {
    getContractGroups: (contractId: number) =>
      this.request<ContractGroupsResponse>(`/groups/contract/${contractId}`),
    getOrgGroups: (orgId: string) =>
      this.request<OrgBusinessGroupsResponse>(`/groups/org/${orgId}`),
  };

  users = {
    getOrgUsers: (orgId: string) =>
      this.request<OrgUsersResponse>(`/users/org/${orgId}`),
  };

  tags = {
    updateContractTags: (contractId: number, tagIds: number[]) =>
      this.request<{ success: boolean }>(`/tags/contract/${contractId}`, {
        method: 'PUT',
        body: JSON.stringify({ tagIds }),
      }),
    getOrgTags: (orgId: string) =>
      this.request<ContractTagsResponse>(`/tags/org/${orgId}`),
    getEntityTags: (entityId: number) =>
      this.request<EntityTagsResponse>(`/tags/entity/${entityId}`),
    updateEntityTags: (entityId: number, tags: string[]) =>
      this.request<{ success: boolean }>(`/tags/entity/${entityId}`, {
        method: 'PUT',
        body: JSON.stringify({ tags }),
      }),
  };

  organizationPreferences = {
    getPostsigEmailAddress: () =>
      this.request<PostsigEmailAddressResponse>(
        '/organization-preferences/postsig-email-address',
      ),
    togglePostsigEmailAddress: (value: boolean) =>
      this.request<{ preferenceValue: boolean }>(
        '/organization-preferences/postsig-email-address',
        {
          method: 'POST',
          body: JSON.stringify({ value }),
        },
      ),
    getVendorWhitelist: () =>
      this.request<import('@/app/api/v2/types/api').VendorWhitelistResponse>(
        '/organization-preferences/vendor-whitelist',
      ),
    addVendor: (entry: { email: string; vendorName?: string }) =>
      this.request<import('@/app/api/v2/types/api').VendorWhitelistResponse>(
        '/organization-preferences/vendor-whitelist',
        {
          method: 'POST',
          body: JSON.stringify(entry),
        },
      ),
    addVendors: (vendors: { email: string; vendorName?: string }[]) =>
      this.request<
        import('@/app/api/v2/types/api').VendorWhitelistBulkResponse
      >('/organization-preferences/vendor-whitelist/bulk', {
        method: 'POST',
        body: JSON.stringify({ vendors }),
      }),
    removeVendor: (email: string) =>
      this.request<import('@/app/api/v2/types/api').VendorWhitelistResponse>(
        `/organization-preferences/vendor-whitelist/${encodeURIComponent(email)}`,
        {
          method: 'DELETE',
        },
      ),
    replaceVendorWhitelist: (whitelist: unknown[]) =>
      this.request<import('@/app/api/v2/types/api').VendorWhitelistResponse>(
        '/organization-preferences/vendor-whitelist',
        {
          method: 'PUT',
          body: JSON.stringify({ whitelist }),
        },
      ),
    uploadVendorWhitelistCSV: (file: File, replace: boolean) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('replace', String(replace));

      return this.uploadForm<
        import('@/app/api/v2/types/api').VendorWhitelistUploadResponse
      >('/organization-preferences/vendor-whitelist/upload', formData);
    },
  };

  employeeImport = {
    preview: (
      file: File,
      mapping?: EmployeeImportMapping,
      includeAllRows = false,
    ) => {
      const formData = new FormData();
      formData.append('file', file);
      if (mapping) formData.append('mapping', JSON.stringify(mapping));
      if (includeAllRows) formData.append('includeAllRows', 'true');

      return this.uploadForm<EmployeeImportPreviewResponse>(
        '/employee-import/preview',
        formData,
      );
    },
    commit: (file: File, mapping: EmployeeImportMapping) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mapping', JSON.stringify(mapping));

      return this.uploadForm<EmployeeImportCommitResponse>(
        '/employee-import/commit',
        formData,
      );
    },
    saveMapping: (mapping: EmployeeImportMapping) =>
      this.request<{ mapping: EmployeeImportMapping }>(
        '/employee-import/mapping',
        { method: 'POST', body: JSON.stringify({ mapping }) },
      ),
  };

  chat = {
    sessions: {
      list: () => this.request<ChatSessionsResult>('/chat/sessions'),
      create: (title?: string) =>
        this.request<CreateSessionResult>('/chat/sessions', {
          method: 'POST',
          body: JSON.stringify({ title }),
        }),
      update: (sessionId: number, title: string) =>
        this.request<{ session: import('@/app/api/v2/types/api').ChatSession }>(
          `/chat/sessions/${sessionId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ title }),
          },
        ),
      delete: (sessionId: number) =>
        this.request<{ success: boolean }>(`/chat/sessions/${sessionId}`, {
          method: 'DELETE',
        }),
    },
    messages: {
      list: (
        sessionId: number,
        pagination?: { limit?: number; offset?: number },
      ) => {
        const params = new URLSearchParams({ sessionId: String(sessionId) });
        if (pagination?.limit !== undefined)
          params.set('limit', String(pagination.limit));
        if (pagination?.offset !== undefined)
          params.set('offset', String(pagination.offset));
        return this.request<ChatMessagesResult>(
          `/chat/messages?${params.toString()}`,
        );
      },
    },
    welcome: {
      get: () => this.request<WelcomeDataResponse>('/chat/welcome'),
    },
  };

  investor = {
    getDocumentSummary: () =>
      this.request<VentureDocumentSummaryResult>('/investor/document-summary'),
    getDocuments: () =>
      this.request<import('@/app/api/v2/types/api').VentureDocumentsResult>(
        '/investor/documents',
      ),
    processDocument: (payload: {
      fileName: string;
      filePath: string;
      fileType: string;
      fileSize: number;
      zipListing?: unknown;
    }) =>
      this.request<{ success: boolean; documentId?: string }>(
        '/investor/process-document',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),
  };

  inv = {
    list: () =>
      this.request<InvPortfolioCompaniesResult>('/investor/inv/companies'),
    get: (publicId: string) =>
      this.request<InvPortfolioCompanyResult>(
        `/investor/inv/companies/${publicId}`,
      ),
    listFunds: () => this.request<InvFundsResult>('/investor/inv/funds'),
  };

  archives = {
    list: (moduleCode: string) =>
      this.request<ModuleArchivesResult>(
        `/archives?module=${encodeURIComponent(moduleCode)}`,
      ),
  };

  reporting = {
    createRequest: (payload: CreateReportingRequestInput) =>
      this.request<{
        publicId: string;
        emailed: boolean;
        companyDomain: string | null;
      }>('/investor/reporting/requests', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getRequest: (publicId: string) =>
      this.request<{
        details: ReportingRequestDetails;
        recipients: RequestRecipient[];
      }>(`/investor/reporting/requests/${publicId}`),
    addRecipient: (publicId: string, email: string) =>
      this.request<{ ok: true }>(
        `/investor/reporting/requests/${publicId}/recipients`,
        {
          method: 'POST',
          body: JSON.stringify({ email }),
        },
      ),
    sendReminder: (publicId: string) =>
      this.request<{ ok: true }>(
        `/investor/reporting/requests/${publicId}/reminder`,
        { method: 'POST' },
      ),
    listPortcoUsers: (companyId: number) =>
      this.request<{ users: PortcoUserOption[] }>(
        `/investor/reporting/portco-users?companyId=${companyId}`,
      ),
    listKpiEvents: (companyId: number) =>
      this.request<{ kpiEvents: KpiEvent[] }>(
        `/investor/reporting/kpi-events?companyId=${companyId}`,
      ),
    listCustomKpis: (companyId: number) =>
      this.request<{
        customKpis: CompanyCustomKpi[];
        standardOverrides: StandardKpiOverride[];
      }>(`/investor/reporting/custom-kpis?companyId=${companyId}`),
    createCustomKpi: (payload: CreateCustomKpiInput) =>
      this.request<{ publicId: string }>('/investor/reporting/custom-kpis', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    setKpiValue: ({ publicId, ...body }: SetKpiValueInput) =>
      this.request<{ ok: true }>(
        `/investor/reporting/custom-kpis/${publicId}/value`,
        {
          method: 'PUT',
          body: JSON.stringify(body),
        },
      ),
    updateKpiSettings: (payload: { hiddenKpiIds: string[] }) =>
      this.request<{ hiddenKpiIds: string[] }>(
        '/investor/reporting/kpi-settings',
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        },
      ),
    getCustomKpiUsage: (publicId: string) =>
      this.request<CustomKpiUsage>(
        `/investor/reporting/custom-kpis/${publicId}/usage`,
      ),
    deactivateCustomKpi: (publicId: string) =>
      this.request<{ ok: true }>(
        `/investor/reporting/custom-kpis/${publicId}`,
        { method: 'DELETE' },
      ),
  };
}

export const apiClient = new V2ApiClient();
