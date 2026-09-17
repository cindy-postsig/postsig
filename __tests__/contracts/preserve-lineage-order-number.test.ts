// openai.ts constructs an OpenAI client at module load time; stub the
// package so importing it doesn't require a real OPENAI_API_KEY in tests.
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({})),
  toFile: jest.fn(),
}));

jest.mock('@/app/lib/actions/openai', () => ({
  __esModule: true,
  getAdditionalData: jest.fn(),
  mergeContractLineage: jest.fn().mockResolvedValue(undefined),
  setContractOrderNumber: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/data/superuser/contracts', () => ({
  fetchContract: jest.fn().mockResolvedValue({ id: 1, type_id: null }),
}));

jest.mock('@/data/superuser/vendors', () => ({
  expandVendorLineageIds: jest.fn().mockResolvedValue([1]),
}));

jest.mock('@/app/lib/actions/contract-lineage-strategies', () => ({
  contractLineageStrategies: {
    default: jest.fn().mockResolvedValue({}),
  },
}));

import { processContractLineage } from '@/app/lib/actions/contract-processing';
import {
  getAdditionalData,
  mergeContractLineage,
  setContractOrderNumber,
} from '@/app/lib/actions/openai';
import { ModelProvider } from '@/constants/types';

const mockGetAdditionalData = getAdditionalData as jest.Mock;
const mockMergeContractLineage = mergeContractLineage as jest.Mock;
const mockSetContractOrderNumber = setContractOrderNumber as jest.Mock;

function baseParams() {
  return {
    filePath: 'user/file.pdf',
    fileId: 'file-1',
    contractId: 42,
    userId: 'user-1',
    logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
    organizationId: 'org-1',
    columns: ['order_number', 'vendor_name'],
    vendorId: 1,
    processor: ModelProvider.openai,
  };
}

describe('processContractLineage order_number handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMergeContractLineage.mockResolvedValue(undefined);
    mockSetContractOrderNumber.mockResolvedValue(undefined);
  });

  it('never includes order_number in the lineage patch it merges', async () => {
    mockGetAdditionalData.mockResolvedValue({
      data: { order_number: 'PO-123', vendor_name: 'Acme' },
      usage: {},
    });

    await processContractLineage(baseParams());

    expect(mockMergeContractLineage).toHaveBeenCalledTimes(1);
    const [, patch] = mockMergeContractLineage.mock.calls[0];
    expect(patch).not.toHaveProperty('order_number');
    expect(patch).toEqual({ vendor_name: 'Acme' });
  });

  it('sets order_number separately when this run extracts one', async () => {
    mockGetAdditionalData.mockResolvedValue({
      data: { order_number: 'PO-123', vendor_name: 'Acme' },
      usage: {},
    });

    await processContractLineage(baseParams());

    expect(mockSetContractOrderNumber).toHaveBeenCalledWith(42, 'PO-123');
  });

  it('does not touch order_number when this run finds none — critically, it must not delete a value already set by a human, and the merge going through mergeContractLineage (not a wholesale replace) is what guarantees that', async () => {
    mockGetAdditionalData.mockResolvedValue({
      data: { order_number: null, vendor_name: 'Acme' },
      usage: {},
    });

    await processContractLineage(baseParams());

    expect(mockSetContractOrderNumber).not.toHaveBeenCalled();
    expect(mockMergeContractLineage).toHaveBeenCalledWith(42, {
      vendor_name: 'Acme',
    });
  });
});
