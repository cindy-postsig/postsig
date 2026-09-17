export function buildMockSupabaseRpc({ rpcError = null as unknown } = {}) {
  const rpc = jest.fn().mockResolvedValue({ data: null, error: rpcError });
  return { rpc };
}
