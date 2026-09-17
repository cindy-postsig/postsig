/**
 * @jest-environment jsdom
 */
import {
  panelLayoutCookieName,
  panelLayoutCookieStorage,
  parsePanelLayout,
} from '@/lib/panel-layout-cookie';

const saved = (layout: unknown) =>
  JSON.stringify({ '[{"id":"a"},{"id":"b"}]': { expandToSizes: {}, layout } });

describe('parsePanelLayout', () => {
  it('reads the layout out of the shape the panel library persists', () => {
    expect(parsePanelLayout(saved([30, 70]), 2)).toEqual([30, 70]);
  });

  it('tolerates the rounding in shares the library saves', () => {
    expect(parsePanelLayout(saved([26.487, 73.513]), 2)).toEqual([
      26.487, 73.513,
    ]);
  });

  it('reads a value the browser stored URL-encoded', () => {
    expect(parsePanelLayout(encodeURIComponent(saved([25, 75])), 2)).toEqual([
      25, 75,
    ]);
  });

  it.each([
    ['no cookie', undefined],
    ['malformed JSON', '{'],
    ['a bare array', '[30,70]'],
    ['a non-numeric layout', saved(['30', '70'])],
    ['a non-finite layout', saved([Infinity, 1])],
    ['a share outside 0–100', saved([150, -50])],
    ['an empty layout', saved([])],
    ['a layout for a different panel count', saved([20, 30, 50])],
    ['a layout that does not total 100', saved([20, 20])],
  ])('yields nothing for %s', (_, value) => {
    expect(parsePanelLayout(value, 2)).toBeUndefined();
  });

  it('skips a stale entry for another panel count in favour of a matching one', () => {
    const state = JSON.stringify({
      old: { layout: [20, 30, 50] },
      current: { layout: [40, 60] },
    });
    expect(parsePanelLayout(state, 2)).toEqual([40, 60]);
  });
});

describe('panelLayoutCookieStorage', () => {
  it('round-trips through document.cookie under the library key', () => {
    const name = panelLayoutCookieName('test-sidebar');
    panelLayoutCookieStorage.setItem(name, saved([40, 60]));
    expect(panelLayoutCookieStorage.getItem(name)).toBe(saved([40, 60]));
    expect(document.cookie).toContain(`${name}=`);
    expect(
      parsePanelLayout(panelLayoutCookieStorage.getItem(name) ?? undefined, 2),
    ).toEqual([40, 60]);
  });

  it('is null for a cookie whose percent-encoding is broken', () => {
    const name = panelLayoutCookieName('broken');
    document.cookie = `${name}=%E0%A4%A; path=/`;
    expect(panelLayoutCookieStorage.getItem(name)).toBeNull();
  });

  it('is null for a group that was never saved', () => {
    expect(
      panelLayoutCookieStorage.getItem(panelLayoutCookieName('never')),
    ).toBeNull();
  });
});
