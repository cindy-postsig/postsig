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

import { setContractOrderNumber } from '@/app/lib/actions/openai';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import { buildMockSupabaseRpc as buildMockSupabase } from '../helpers/supabase-rpc-mock';

const mockCreateServiceClient = createServiceClient as jest.Mock;

describe('setContractOrderNumber', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls set_contract_order_number with onlyIfEmpty so it never overwrites a set value', async () => {
    const mock = buildMockSupabase();
    mockCreateServiceClient.mockReturnValue(mock);

    await setContractOrderNumber(1, 'AI-999');

    expect(mock.rpc).toHaveBeenCalledWith('set_contract_order_number', {
      p_contract_id: 1,
      p_order_number: 'AI-999',
      p_only_if_empty: true,
    });
  });

  it('sanitizes the order number before writing it', async () => {
    const mock = buildMockSupabase();
    mockCreateServiceClient.mockReturnValue(mock);

    await setContractOrderNumber(1, '  AI-999  ');

    expect(mock.rpc).toHaveBeenCalledWith('set_contract_order_number', {
      p_contract_id: 1,
      p_order_number: 'AI-999',
      p_only_if_empty: true,
    });
  });

  it('throws when the RPC fails', async () => {
    const mock = buildMockSupabase({ rpcError: { message: 'boom' } });
    mockCreateServiceClient.mockReturnValue(mock);

    await expect(setContractOrderNumber(1, 'X')).rejects.toEqual({
      message: 'boom',
    });
  });
});
