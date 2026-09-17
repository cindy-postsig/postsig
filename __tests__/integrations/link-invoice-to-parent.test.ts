import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('@/lib/api/nango', () => ({
  getNangoClient: jest.fn(),
  NANGO_PROVIDER_IDS: {},
}));

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/v2/integrations/settings-service', () => ({
  buildConnectionHealthUpdate: jest.fn(),
}));

const saveContractLineage = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('@/data/superuser/contracts', () => ({
  saveContractLineage: (...args: unknown[]) => saveContractLineage(...args),
}));

const logAlert = jest.fn();
jest.mock('@/utils/logging/alert', () => ({
  logAlert: (...args: unknown[]) => logAlert(...args),
}));

import { linkInvoiceToParentContract } from '@/lib/v2/integrations/invoice-sync/service';

describe('linkInvoiceToParentContract', () => {
  beforeEach(() => {
    saveContractLineage.mockReset();
    logAlert.mockReset();
  });

  it('links through saveContractLineage with the sync provenance in metadata', async () => {
    saveContractLineage.mockResolvedValue([]);

    await linkInvoiceToParentContract(11, 22, 'org-1');

    expect(saveContractLineage).toHaveBeenCalledWith(22, 11, {
      source: 'invoice-sync',
      organization_id: 'org-1',
    });
    expect(logAlert).not.toHaveBeenCalled();
  });

  it('alerts instead of throwing when the link fails', async () => {
    const failure = new Error('unrelated vendors');
    saveContractLineage.mockRejectedValue(failure);

    await expect(
      linkInvoiceToParentContract(11, 22, 'org-1'),
    ).resolves.toBeUndefined();

    expect(logAlert).toHaveBeenCalledWith(
      'invoice-sync-link-failure',
      failure,
      { invoiceContractId: 11, parentContractId: 22, organizationId: 'org-1' },
      'Failed to link invoice to parent contract',
    );
  });
});
