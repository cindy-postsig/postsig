import {
  resolveDefaultModule,
  type ModuleAccessEntry,
} from '@/lib/modules/default-module';
import type { ModuleInfo } from '@/constants/types';

const CPM: ModuleInfo = { code: 'cpm', name: 'Core', basePath: '/dashboard' };
const INVESTOR: ModuleInfo = {
  code: 'investor',
  name: 'Investor',
  basePath: '/investor',
};
const PORTCO: ModuleInfo = {
  code: 'portco',
  name: 'PostSig PortCo',
  basePath: '/',
};

function entry(
  module: ModuleInfo,
  {
    isDefault = false,
    moduleActive = true,
  }: { isDefault?: boolean | null; moduleActive?: boolean } = {},
): ModuleAccessEntry {
  return {
    is_default: isDefault,
    app_modules: {
      code: module.code,
      name: module.name,
      base_path: module.basePath,
      is_active: moduleActive,
    },
  };
}

describe('resolveDefaultModule', () => {
  it('uses the is_default grant when it is a module this app serves', () => {
    const entries = [entry(CPM), entry(INVESTOR, { isDefault: true })];
    expect(resolveDefaultModule(entries, [CPM, INVESTOR])).toEqual(INVESTOR);
  });

  // PSK-1862: portco's base_path is '/', so selecting it makes the root page
  // redirect to itself (ERR_TOO_MANY_REDIRECTS).
  it('never selects a portco grant, even when no default is marked', () => {
    const entries = [entry(PORTCO), entry(CPM)];
    expect(resolveDefaultModule(entries, [PORTCO, CPM])).toEqual(CPM);
  });

  // is_default is nullable in the database, and null is the common case: the
  // dev accounts that hit PSK-1862 had grants with no default marked at all.
  it('treats a null is_default as unmarked and falls back to cpm', () => {
    const entries = [
      entry(PORTCO, { isDefault: null }),
      entry(CPM, { isDefault: null }),
    ];
    expect(resolveDefaultModule(entries, [PORTCO, CPM])).toEqual(CPM);
  });

  it('ignores a portco grant marked is_default', () => {
    const entries = [entry(PORTCO, { isDefault: true }), entry(CPM)];
    expect(resolveDefaultModule(entries, [PORTCO, CPM])).toEqual(CPM);
  });

  it('prefers cpm over row order when no default is marked', () => {
    const entries = [entry(INVESTOR), entry(CPM)];
    expect(resolveDefaultModule(entries, [INVESTOR, CPM])).toEqual(CPM);
  });

  it('falls back to another served module when the user lacks cpm', () => {
    const entries = [entry(PORTCO), entry(INVESTOR)];
    expect(resolveDefaultModule(entries, [PORTCO, INVESTOR])).toEqual(INVESTOR);
  });

  it('returns null when the user only holds grants for other apps', () => {
    expect(resolveDefaultModule([entry(PORTCO)], [PORTCO])).toBeNull();
  });

  it('ignores an is_default grant whose module is inactive', () => {
    const entries = [
      entry(INVESTOR, { isDefault: true, moduleActive: false }),
      entry(CPM),
    ];
    expect(resolveDefaultModule(entries, [CPM])).toEqual(CPM);
  });
});
