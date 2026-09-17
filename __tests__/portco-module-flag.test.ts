import {
  isPortcoModuleEnabled,
  type OrgModuleRow,
} from '@/lib/v2/modules/portco';

const row = (code: string, is_enabled: boolean | null): OrgModuleRow => ({
  is_enabled,
  app_modules: { code },
});

describe('isPortcoModuleEnabled', () => {
  it('is true when the portco module row is enabled', () => {
    expect(
      isPortcoModuleEnabled([row('investor', true), row('portco', true)]),
    ).toBe(true);
  });

  it('is false when the portco row is explicitly disabled', () => {
    expect(isPortcoModuleEnabled([row('portco', false)])).toBe(false);
  });

  it('is false when the portco row has a null is_enabled', () => {
    expect(isPortcoModuleEnabled([row('portco', null)])).toBe(false);
  });

  it('is false when the org has no portco row', () => {
    expect(
      isPortcoModuleEnabled([row('cpm', true), row('investor', true)]),
    ).toBe(false);
  });

  it('is false for an org with no modules', () => {
    expect(isPortcoModuleEnabled([])).toBe(false);
  });

  it('ignores a different enabled module sharing the row shape', () => {
    expect(isPortcoModuleEnabled([row('investor', true)])).toBe(false);
  });

  it('tolerates a null app_modules join', () => {
    expect(
      isPortcoModuleEnabled([{ is_enabled: true, app_modules: null }]),
    ).toBe(false);
  });
});
