import { ApiClient } from './client';

interface DocuSignAuthResponse {
  url: string;
}

export interface DocuSignDocument {
  documentId: string;
  name: string;
  envelopeId: string;
  subject: string;
  status: string;
  createdDateTime: string;
  completedDateTime?: string;
}

export interface AppDocuSignDocument extends DocuSignDocument {
  appUniqueId: string;
}

interface DocuSignListResponse {
  documents: DocuSignDocument[];
}

interface DocuSignEnvelopeStatusResponse {
  status: string;
  statusDateTime: string;
  envelope: any;
  nextPollIn: number;
}

interface DocuSignRateLimitedResponse {
  error: string;
  message: string;
  nextPollIn: number;
  rateLimited: boolean;
}

type EnvelopeStatusResponse =
  | DocuSignEnvelopeStatusResponse
  | DocuSignRateLimitedResponse;

interface DocuSignDownloadResponse {
  success: boolean;
  documentContent: string;
}

export class DocuSignService {
  private client: ApiClient;

  constructor() {
    this.client = new ApiClient();
  }

  async getAuthUrl(returnUrl?: string): Promise<{
    data: DocuSignAuthResponse | null;
    error: Error | null;
  }> {
    return this.client.post<DocuSignAuthResponse>('/docusign/auth/url', {
      returnUrl,
    });
  }

  async listDocuments(): Promise<{
    data: DocuSignListResponse | null;
    error: Error | null;
  }> {
    return this.client.get<DocuSignListResponse>(
      '/docusign/list-documents?include_items=true',
    );
  }

  async getEnvelopeStatus(
    envelopeId: string,
    force: boolean = false,
  ): Promise<{
    data: EnvelopeStatusResponse | null;
    error: Error | null;
  }> {
    return this.client.get<EnvelopeStatusResponse>(
      `/docusign/envelope-status?envelopeId=${envelopeId}&force=${force}`,
    );
  }

  async downloadDocument(
    documentId: string,
    envelopeId: string,
    name: string,
  ): Promise<{ data: Blob | null; error: Error | null }> {
    const response = await fetch(`/api/docusign/download-document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentId,
        envelopeId,
        name,
      }),
    });

    if (!response.ok) {
      return {
        data: null,
        error: new Error('Failed to download document'),
      };
    }

    const blob = await response.blob();
    return { data: blob, error: null };
  }

  async disconnect(): Promise<{ data: any | null; error: Error | null }> {
    return this.client.post('/docusign/auth/disconnect', {});
  }
}
