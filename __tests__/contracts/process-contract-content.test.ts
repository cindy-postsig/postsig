import type { Context } from 'hono';

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// The stored object's bytes, set per test.
const storedBytes: { value: Uint8Array<ArrayBufferLike> } = {
  value: new Uint8Array(),
};

function toArrayBuffer(bytes: Uint8Array<ArrayBufferLike>): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function downloadStub() {
  return { arrayBuffer: async () => toArrayBuffer(storedBytes.value) };
}

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        download: async () => ({ data: downloadStub(), error: null }),
      }),
    },
  }),
}));

// `file-type` is ESM-only with no CJS entry point, so the thin wrapper - the
// repo's single integration point with it - is mocked. A PDF resolves to its
// own mime; anything else here sniffs as an executable.
jest.mock('@/utils/file-type', () => ({
  __esModule: true,
  detectFileType: jest.fn(async (buffer: Uint8Array) => {
    const head = Buffer.from(buffer.slice(0, 5)).toString();
    if (head === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
    return { mime: 'application/x-msdownload', ext: 'exe' };
  }),
}));

const uploadToOpenAi = jest.fn(async () => ({ id: 'file-1' }));
jest.mock('@/app/lib/actions/openai', () => ({
  uploadToOpenAi: () => uploadToOpenAi(),
}));

const insertContract = jest.fn(async () => [{ id: 42 }]);
const insertContractDoc = jest.fn(async () => undefined);
jest.mock('@/data/superuser/contracts', () => ({
  insertContract: () => insertContract(),
  insertContractDoc: () => insertContractDoc(),
}));

jest.mock('@/data/superuser/activities', () => ({
  logProcessingStatusChange: jest.fn(async () => undefined),
  logContractUploaded: jest.fn(async () => undefined),
}));

const sendEvent = jest.fn(async () => undefined);
jest.mock('@/utils/inngest/client', () => ({
  inngest: { send: () => sendEvent() },
}));

const cacheStub = {
  invalidateOrganizationData: jest.fn(async () => undefined),
  invalidateVendorList: jest.fn(async () => undefined),
};
jest.mock('@/app/lib/redis/cache-service', () => ({
  getCacheService: async () => cacheStub,
}));

jest.mock('@/lib/audit', () => ({
  auditLogger: { logEvent: jest.fn(async () => undefined) },
  AUDIT_ACTIONS: {},
  AUDIT_RESOURCE_TYPES: {},
  extractAuditContext: () => ({}),
}));

import { processContract } from '@/app/api/v2/handlers/contracts/process-contract';

const user = { userId: 'user-1', organizationId: 'org-1' };

interface JsonResponse {
  body: Record<string, unknown>;
  status: number;
}

const requestBody = {
  fileName: 'report.pdf',
  modelProvider: 'google',
  processType: 'initial',
};

/** The slice of Hono's Context the handler touches. */
function ctx(captured: JsonResponse[]): Context {
  return {
    get: (key: string) => (key === 'userMetadata' ? user : undefined),
    req: { json: async () => requestBody },
    json: (body: Record<string, unknown>, status = 200) => {
      captured.push({ body, status });
      return body as never;
    },
  } as unknown as Context;
}

function genuinePdf(): Uint8Array {
  return new Uint8Array(Buffer.from('%PDF-1.4\ntrailer\n<<>>\n%%EOF\n'));
}

function windowsExecutable(): Uint8Array {
  const buf = Buffer.alloc(64);
  buf.write('MZ', 0);
  return new Uint8Array(buf);
}

describe('processContract content validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('processes a contract whose bytes are a PDF', async () => {
    storedBytes.value = genuinePdf();
    const captured: JsonResponse[] = [];

    await processContract(ctx(captured));

    expect(captured[0]?.body).toEqual({ contractId: 42 });
    expect(insertContract).toHaveBeenCalled();
  });

  it('rejects a file whose bytes are not a PDF', async () => {
    storedBytes.value = windowsExecutable();
    const captured: JsonResponse[] = [];

    await processContract(ctx(captured));

    expect(captured[0]?.body.error).toContain('Unsupported file type');
    expect(captured[0]?.body.error).toContain('application/x-msdownload');
  });

  it('creates no contract and starts no extraction for a rejected file', async () => {
    storedBytes.value = windowsExecutable();

    await processContract(ctx([]));

    // The whole point of validating before these run: a spoofed upload must
    // leave no contract record and never reach the model.
    expect(insertContract).not.toHaveBeenCalled();
    expect(insertContractDoc).not.toHaveBeenCalled();
    expect(uploadToOpenAi).not.toHaveBeenCalled();
    expect(sendEvent).not.toHaveBeenCalled();
  });
});
