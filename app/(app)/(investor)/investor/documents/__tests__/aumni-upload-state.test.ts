/**
 * @jest-environment jsdom
 */
import { describe, expect, it, beforeEach } from '@jest/globals';
import {
  savePending,
  loadPending,
  clearPending,
} from '@/app/(app)/(investor)/investor/documents/aumni-upload-state';

describe('aumni-upload-state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when nothing is stored', () => {
    expect(loadPending('org-1')).toBeNull();
  });

  it('round-trips a pending upload', () => {
    savePending('org-1', 'export.zip', 'org-1/aumni_export/export.zip');
    const result = loadPending('org-1');

    expect(result).not.toBeNull();
    expect(result?.fileName).toBe('export.zip');
    expect(result?.safePath).toBe('org-1/aumni_export/export.zip');
    expect(typeof result?.startedAt).toBe('number');
  });

  it('scopes by organization id', () => {
    savePending('org-1', 'a.zip', 'org-1/aumni_export/a.zip');
    savePending('org-2', 'b.zip', 'org-2/aumni_export/b.zip');

    expect(loadPending('org-1')?.fileName).toBe('a.zip');
    expect(loadPending('org-2')?.fileName).toBe('b.zip');
  });

  it('clears pending for a specific org', () => {
    savePending('org-1', 'a.zip', 'org-1/aumni_export/a.zip');
    savePending('org-2', 'b.zip', 'org-2/aumni_export/b.zip');

    clearPending('org-1');

    expect(loadPending('org-1')).toBeNull();
    expect(loadPending('org-2')).not.toBeNull();
  });

  it('overwrites previous pending for same org', () => {
    savePending('org-1', 'first.zip', 'org-1/aumni_export/first.zip');
    savePending('org-1', 'second.zip', 'org-1/aumni_export/second.zip');

    expect(loadPending('org-1')?.fileName).toBe('second.zip');
  });
});
