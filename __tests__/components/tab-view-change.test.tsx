/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render } from '@testing-library/react';

let searchParams = new URLSearchParams();
const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));

jest.mock('@vercel/analytics', () => ({ track: jest.fn() }));

import TabComponent from '@/app/ui/Tab';

const tab = (key: string) => ({ key, label: key, content: <div>{key}</div> });

describe('TabComponent onViewChange fallback', () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
  });

  it('reports the kept valid selection, not the default, when the url param goes away', () => {
    const onViewChange = jest.fn();
    searchParams = new URLSearchParams('tab=b');

    const { rerender } = render(
      <TabComponent tabs={[tab('a'), tab('b')]} onViewChange={onViewChange} />,
    );
    expect(onViewChange).toHaveBeenLastCalledWith('b');

    searchParams = new URLSearchParams();
    rerender(
      <TabComponent tabs={[tab('a'), tab('b')]} onViewChange={onViewChange} />,
    );

    expect(onViewChange).toHaveBeenLastCalledWith('b');
  });

  it('reports the fallback tab when the selection no longer names a rendered tab', () => {
    const onViewChange = jest.fn();
    searchParams = new URLSearchParams('tab=b');

    const { rerender } = render(
      <TabComponent tabs={[tab('a'), tab('b')]} onViewChange={onViewChange} />,
    );

    searchParams = new URLSearchParams();
    rerender(<TabComponent tabs={[tab('a')]} onViewChange={onViewChange} />);

    expect(onViewChange).toHaveBeenLastCalledWith('a');
  });
});
