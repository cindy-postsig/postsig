// openai.ts constructs an OpenAI client at module load time; stub the
// package so importing it doesn't require a real OPENAI_API_KEY in tests.
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({})),
  toFile: jest.fn(),
}));

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: jest.fn(),
}));

import { mergeContractLineage } from '@/app/lib/actions/openai';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import { buildMockSupabaseRpc as buildMockSupabase } from '../helpers/supabase-rpc-mock';

const mockCreateServiceClient = createServiceClient as jest.Mock;

describe('mergeContractLineage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls merge_contract_lineage with the patch, not a replacement of the whole column', async () => {
    const mock = buildMockSupabase();
    mockCreateServiceClient.mockReturnValue(mock);

    await mergeContractLineage(1, { vendor_name: 'Acme' });

    expect(mock.rpc).toHaveBeenCalledWith('merge_contract_lineage', {
      p_contract_id: 1,
      p_lineage_patch: { vendor_name: 'Acme' },
    });
  });

  it('throws when the RPC fails', async () => {
    const mock = buildMockSupabase({ rpcError: { message: 'boom' } });
    mockCreateServiceClient.mockReturnValue(mock);

    await expect(
      mergeContractLineage(1, { vendor_name: 'Acme' }),
    ).rejects.toEqual({ message: 'boom' });
  });
});
