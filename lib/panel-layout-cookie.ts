import type { PanelGroupStorage } from 'react-resizable-panels';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const panelLayoutCookieName = (autoSaveId: string) =>
  `react-resizable-panels:${autoSaveId}`;

// Mirrors the library's own persisted shape, `{ [panelKey]: { layout } }`,
// so the server can render the first paint at the width the library restores.
export function parsePanelLayout(
  cookieValue: string | undefined,
  panelCount: number,
): number[] | undefined {
  if (!cookieValue) return undefined;
  try {
    const state: unknown = JSON.parse(decodeURIComponent(cookieValue));
    if (typeof state !== 'object' || state === null) return undefined;
    for (const entry of Object.values(state)) {
      const layout: unknown = (entry as { layout?: unknown })?.layout;
      if (
        Array.isArray(layout) &&
        layout.length === panelCount &&
        layout.every(isPercentage) &&
        totalsOneHundred(layout)
      ) {
        return layout;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

const isPercentage = (value: unknown): value is number =>
  typeof value === 'number' && value >= 0 && value <= 100;

// The library normalizes any other total on mount, which would leave the
// server-rendered width disagreeing with the client's.
const SUM_TOLERANCE = 0.01;
const totalsOneHundred = (layout: number[]) =>
  Math.abs(layout.reduce((sum, value) => sum + value, 0) - 100) <=
  SUM_TOLERANCE;

export const panelLayoutCookieStorage: PanelGroupStorage = {
  getItem: (name) => {
    const prefix = `${name}=`;
    const match = document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith(prefix));
    if (!match) return null;
    try {
      return decodeURIComponent(match.slice(prefix.length));
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  },
};
