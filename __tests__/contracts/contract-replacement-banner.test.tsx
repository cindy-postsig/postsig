/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const refresh = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const toast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({
  toast: (args: unknown) => toast(args),
}));

const updateContractStatus = jest.fn(
  async (..._args: unknown[]): Promise<boolean> => true,
);
jest.mock('@/hooks/useContractStatusUpdate', () => ({
  useContractStatusUpdate: () => ({ updateContractStatus, isLoading: false }),
}));

const confirmContractReplacement = jest.fn(
  async (_id: number): Promise<{ resolved: boolean }> => ({ resolved: true }),
);
const rejectContractReplacement = jest.fn(
  async (_id: number): Promise<{ resolved: boolean }> => ({ resolved: true }),
);
jest.mock('@/app/lib/contract-replacements/actions', () => ({
  confirmContractReplacement: (id: number) => confirmContractReplacement(id),
  rejectContractReplacement: (id: number) => rejectContractReplacement(id),
}));

import ContractReplacementBanner, {
  type ContractReplacementPrompt,
} from '@/components/contracts/ContractReplacementBanner';

const EVENT_ID = 11;
const OLD_CONTRACT_ID = 7;
const NEW_CONTRACT_ID = 9;

const basePrompt: ContractReplacementPrompt = {
  eventId: EVENT_ID,
  oldContractId: OLD_CONTRACT_ID,
  linkedContractId: NEW_CONTRACT_ID,
  vendorName: 'Acme Corp',
  firstProductName: 'Widget Pro',
  linkedContractDate: '01/02/2026',
  oldContractEndDate: '31/01/2026',
};

/** The same event seen from the replacement's page: line 1 names the OLD side. */
const oldSidePrompt: Partial<ContractReplacementPrompt> = {
  linkedContractId: OLD_CONTRACT_ID,
  vendorName: 'OldCo',
  linkedContractDate: '01/02/2024',
};

const renderBanner = (
  prompt: Partial<ContractReplacementPrompt> = {},
  surface: 'old' | 'new' = 'old',
) =>
  render(
    <ContractReplacementBanner
      prompt={{ ...basePrompt, ...prompt }}
      oldContractVendorName="Acme Corp"
      surface={surface}
    />,
  );

beforeEach(() => {
  jest.clearAllMocks();
  updateContractStatus.mockResolvedValue(true);
  confirmContractReplacement.mockResolvedValue({ resolved: true });
  rejectContractReplacement.mockResolvedValue({ resolved: true });
});

describe('ContractReplacementBanner copy', () => {
  it('renders the ticket copy naming contract, vendor, product and date', () => {
    renderBanner();

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(
      `We detected a potentially newer contract ${NEW_CONTRACT_ID}`,
    );
    expect(alert.textContent).toContain('Acme Corp – Widget Pro');
    expect(alert.textContent).toContain('dated 01/02/2026');
  });

  it('links the whole line to the new contract', () => {
    renderBanner();

    expect(
      screen
        .getByRole('link', { name: /potentially newer contract/ })
        .getAttribute('href'),
    ).toBe(`/contracts/${NEW_CONTRACT_ID}`);
  });

  it('omits the product when the new contract has none', () => {
    renderBanner({ firstProductName: null });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Acme Corp');
    expect(alert.textContent).not.toContain('–');
  });

  it('omits the date clause when the new contract has no start date', () => {
    renderBanner({ linkedContractDate: null });

    expect(screen.getByRole('alert').textContent).not.toContain('dated');
  });

  it('offers both answers', () => {
    renderBanner();

    expect(screen.getByRole('button', { name: 'Yes' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'No, keep it active' }),
    ).toBeTruthy();
  });

  it('asks the archive question naming the old contract end date', () => {
    renderBanner();

    expect(screen.getByRole('alert').textContent).toContain(
      'Archive this older contract on 31/01/2026?',
    );
  });

  it('drops the date clause when the old contract has no end date', () => {
    // Detection guaranteed an end date once, but data can change afterwards.
    renderBanner({ oldContractEndDate: null });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Archive this older contract?');
    expect(alert.textContent).not.toContain('contract on');
  });

  it('keeps line 2 plain text', () => {
    // Line 1 carries the only link; the archive question never links anywhere.
    renderBanner();

    expect(
      screen.queryByRole('link', { name: /Archive this older contract/ }),
    ).toBeNull();
  });
});

describe('ContractReplacementBanner on the replacement page', () => {
  it('renders the copy naming the old contract it would archive', () => {
    renderBanner(oldSidePrompt, 'new');

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(
      `We detected that this contract potentially replaces contract ${OLD_CONTRACT_ID}`,
    );
    expect(alert.textContent).toContain('OldCo – Widget Pro');
    expect(alert.textContent).toContain('dated 01/02/2024');
  });

  it('links the whole line to the older contract', () => {
    // The banner never links to the page it renders on.
    renderBanner(oldSidePrompt, 'new');

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toContain('potentially replaces contract');
    expect(links[0].getAttribute('href')).toBe(`/contracts/${OLD_CONTRACT_ID}`);
  });

  it('still asks the archive question with the end date', () => {
    renderBanner(oldSidePrompt, 'new');

    expect(screen.getByRole('alert').textContent).toContain(
      'Archive this older contract on 31/01/2026?',
    );
  });

  it('still archives the old contract on confirm', async () => {
    renderBanner(oldSidePrompt, 'new');
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));

    await waitFor(() =>
      expect(updateContractStatus).toHaveBeenCalledWith(
        String(OLD_CONTRACT_ID),
        'inactive',
        'Acme Corp',
      ),
    );
  });
});

describe('ContractReplacementBanner confirm path', () => {
  it('archives the old contract before recording the replacement', async () => {
    const order: string[] = [];
    updateContractStatus.mockImplementation(async () => {
      order.push('archive');
      return true;
    });
    confirmContractReplacement.mockImplementation(async () => {
      order.push('confirm');
      return { resolved: true };
    });

    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));

    await waitFor(() => expect(order).toEqual(['archive', 'confirm']));
  });

  it('archives through the existing archive path, naming the old contract', async () => {
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));

    await waitFor(() =>
      expect(updateContractStatus).toHaveBeenCalledWith(
        String(OLD_CONTRACT_ID),
        'inactive',
        'Acme Corp',
      ),
    );
  });

  it('confirms the event the banner was rendered for', async () => {
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));

    await waitFor(() =>
      expect(confirmContractReplacement).toHaveBeenCalledWith(EVENT_ID),
    );
  });

  it('leaves the event unresolved when the archive fails', async () => {
    // The prompt must survive so the user can retry.
    updateContractStatus.mockResolvedValue(false);

    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));

    await waitFor(() => expect(updateContractStatus).toHaveBeenCalled());
    expect(confirmContractReplacement).not.toHaveBeenCalled();
  });

  it('surfaces an error when the archive succeeded but the event did not', async () => {
    confirmContractReplacement.mockRejectedValue(new Error('update failed'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      ),
    );
  });
});

describe('ContractReplacementBanner reject path', () => {
  it('rejects the event without archiving anything', async () => {
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'No, keep it active' }));

    await waitFor(() =>
      expect(rejectContractReplacement).toHaveBeenCalledWith(EVENT_ID),
    );
    expect(updateContractStatus).not.toHaveBeenCalled();
  });

  it('refreshes so the resolved banner disappears', async () => {
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'No, keep it active' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('surfaces an error when the rejection fails', async () => {
    rejectContractReplacement.mockRejectedValue(new Error('nope'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'No, keep it active' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      ),
    );
  });
});
