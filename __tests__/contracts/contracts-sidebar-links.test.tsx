/**
 * @jest-environment jsdom
 *
 * The primary nav, the contracts sidebar and the status tabs render a link per
 * destination, folder and view; with prefetch on, every /contracts load fired a
 * server render for each of them (folders, NDAs, trials, pending, archived)
 * before the user clicked anything.
 */
import React from 'react';
import { render } from '@testing-library/react';
import NavLink from '@/components/NavLink';
import ContractsSidebar from '@/app/(app)/(cpm)/contracts/(views)/ContractsSidebar';
import StatusNav from '@/app/(app)/(cpm)/contracts/StatusNav';

jest.mock('next/navigation', () => ({
  usePathname: () => '/contracts',
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    prefetch,
    children,
  }: {
    href: string;
    prefetch?: boolean;
    children: React.ReactNode;
  }) => (
    <a href={href} data-prefetch={String(prefetch)}>
      {children}
    </a>
  ),
}));

jest.mock('@/app/(app)/(cpm)/contracts/(views)/FolderContext', () => ({
  useFolderContext: () => ({
    folders: [
      { id: 1, name: 'Index Data', path: '/Index Data', public_uuid: 'f-1' },
      { id: 2, name: 'Rating Data', path: '/Rating Data', public_uuid: 'f-2' },
    ],
  }),
}));

jest.mock('@/components/providers/AbilityProvider', () => ({
  useAbility: () => ({ can: () => true }),
}));

jest.mock('@/components/contracts/CreateFolderDialog', () => ({
  CreateFolderDialog: () => null,
}));

// Server-action module; it drags next/cache into jsdom.
jest.mock('@/data/superuser/folders', () => ({
  getAllFolders: jest.fn(),
  assignContractToFolder: jest.fn(),
}));

jest.mock('@/components/ui/use-toast', () => ({ toast: jest.fn() }));

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

function prefetchValues(container: HTMLElement): string[] {
  return [...container.querySelectorAll('a[href]')].map(
    (a) => a.getAttribute('data-prefetch') ?? 'missing',
  );
}

describe('primary nav links', () => {
  it('renders with prefetch off', () => {
    const { container } = render(
      <NavLink href="/contracts">Contracts</NavLink>,
    );

    expect(prefetchValues(container)).toEqual(['false']);
  });
});

describe('contracts sidebar links', () => {
  it('renders every folder and view link with prefetch off', () => {
    const { container } = render(
      <ContractsSidebar
        organizationId="org-1"
        userId="user-1"
        initialFolders={[]}
        contractCounts={{ trials: 0, ndas: 0, total: 37 }}
      />,
    );

    const links = prefetchValues(container);
    expect(links.length).toBeGreaterThanOrEqual(7);
    expect(new Set(links)).toEqual(new Set(['false']));
  });
});

describe('status nav links', () => {
  it('renders the view tabs with prefetch off', () => {
    const { container } = render(<StatusNav />);

    const links = prefetchValues(container);
    expect(links).toHaveLength(3);
    expect(new Set(links)).toEqual(new Set(['false']));
  });
});
