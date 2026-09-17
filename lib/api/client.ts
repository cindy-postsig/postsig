import { ExternalServiceError } from '../errors';

interface ApiClientOptions {
  baseURL?: string;
  headers?: Record<string, string>;
}

interface ApiResponse<T> {
  data: T | null;
  error: Error | null;
}

export class ApiClient {
  private baseURL: string;
  private headers: Record<string, string>;

  constructor(options: ApiClientOptions = {}) {
    this.baseURL = options.baseURL || '/api';
    this.headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        ...options,
        headers: {
          ...this.headers,
          ...options.headers,
        },
      });

      if (!response.ok) {
        throw new ExternalServiceError(
          'HTTP',
          `Request failed: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      return {
        data: null,
        error:
          error instanceof Error ? error : new Error('Unknown error occurred'),
      };
    }
  }

  async get<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async post<T>(
    endpoint: string,
    body: any,
    options: RequestInit = {},
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}
