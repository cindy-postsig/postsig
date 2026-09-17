// __tests__/v2/inv-overrides-fetch.test.ts
import { getActiveValueOverrides } from '@/lib/v2/inv/overrides/fetchOverrides';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import { getMcpContext } from '@/app/lib/mcp/context';

jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }));
jest.mock('@/utils/supabase/service_server', () => ({
  createClient: jest.fn(),
}));
jest.mock('@/app/lib/mcp/context', () => ({ getMcpContext: jest.fn() }));
jest.mock('@/utils/pino', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

const mockServerClient = createServerClient as jest.Mock;
const mockServiceClient = createServiceClient as jest.Mock;
const mockGetMcpContext = getMcpContext as jest.Mock;

interface QueryResult {
  data: unknown[] | null;
  error: { message: string } | null;
}

function makeClient(result: QueryResult) {
  const is = jest.fn().mockResolvedValue(result);
  const eq = jest.fn().mockReturnValue({ is });
  const select = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ select });
  return { client: { from }, from, select, eq, is };
}

describe('getActiveValueOverrides', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMcpContext.mockReturnValue(null);
  });

  it('fetches active overrides for the org in one query', async () => {
    const row = { id: 1, field_key: 'amount' };
    const { client, from, select, eq, is } = makeClient({
      data: [row],
      error: null,
    });
    mockServerClient.mockResolvedValue(client);

    const result = await getActiveValueOverrides('org-1');

    expect(result).toEqual([row]);
    expect(from).toHaveBeenCalledWith('inv_value_overrides');
    expect(select).toHaveBeenCalledWith('*');
    expect(eq).toHaveBeenCalledWith('organization_id', 'org-1');
    expect(is).toHaveBeenCalledWith('reverted_at', null);
    expect(mockServiceClient).not.toHaveBeenCalled();
  });

  it('degrades to an empty list on query error', async () => {
    const { client } = makeClient({
      data: null,
      error: { message: 'relation does not exist' },
    });
    mockServerClient.mockResolvedValue(client);

    await expect(getActiveValueOverrides('org-2')).resolves.toEqual([]);
  });

  it('uses the service client in MCP context', async () => {
    mockGetMcpContext.mockReturnValue({ userId: 'u-1' });
    const { client } = makeClient({ data: [], error: null });
    mockServiceClient.mockReturnValue(client);

    await expect(getActiveValueOverrides('org-3')).resolves.toEqual([]);
    expect(mockServiceClient).toHaveBeenCalled();
    expect(mockServerClient).not.toHaveBeenCalled();
  });
});
