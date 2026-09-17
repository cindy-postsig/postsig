/**
 * @jest-environment jsdom
 */
import { describe, expect, it, beforeEach } from '@jest/globals';
import {
  findPendingUploadMatch,
  savePending,
  loadPending,
  removePending,
  clearPending,
  type PendingDocumentUpload,
} from '@/app/(app)/(investor)/investor/documents/documents-upload-state';

type EntryInput = Omit<PendingDocumentUpload, 'startedAt'>;

const BASE: EntryInput = {
  fileId: 'file-1',
  documentPublicId: 'doc-1',
  fileName: 'a.pdf',
  fileType: 'application/pdf',
  fileSize: 1234,
  filePath: 'org-1/investor/doc-1/primary/a.pdf',
};

const entry1 = { ...BASE, fileId: 'f1', fileName: 'one.pdf' };
const entry2 = { ...BASE, fileId: 'f2', fileName: 'two.pdf' };
const entryReplace = { ...BASE, fileId: 'f1', fileName: 'updated.pdf' };
const entryOrgA = { ...BASE, fileName: 'a.pdf' };
const entryOrgB = { ...BASE, fileName: 'b.pdf' };
const entryF1 = { ...BASE, fileId: 'f1' };
const entryF2 = { ...BASE, fileId: 'f2' };
const goodEntry: PendingDocumentUpload = {
  ...BASE,
  fileId: 'good',
  startedAt: 1,
};
const badEntry = { fileId: 'bad' };

beforeEach(() => localStorage.clear());

describe('documents-upload-state - basic', () => {
  it('returns empty array when nothing is stored', () =>
    expect(loadPending('org-1')).toEqual([]));

  it('round-trips a pending upload', () => {
    savePending('org-1', BASE);
    const result = loadPending('org-1');
    expect(result).toHaveLength(1);
    expect(result[0].fileName).toBe('a.pdf');
    expect(result[0].filePath).toBe('org-1/investor/doc-1/primary/a.pdf');
    expect(typeof result[0].startedAt).toBe('number');
  });

  it('stores multiple pending uploads per organization', () => {
    savePending('org-1', entry1);
    savePending('org-1', entry2);
    const names = loadPending('org-1')
      .map((e) => e.fileName)
      .sort();
    expect(names).toEqual(['one.pdf', 'two.pdf']);
  });

  it('replaces an entry with the same fileId', () => {
    savePending('org-1', entry1);
    savePending('org-1', entryReplace);
    const result = loadPending('org-1');
    expect(result).toHaveLength(1);
    expect(result[0].fileName).toBe('updated.pdf');
  });

  it('scopes by organization id', () => {
    savePending('org-1', entryOrgA);
    savePending('org-2', entryOrgB);
    expect(loadPending('org-1')[0].fileName).toBe('a.pdf');
    expect(loadPending('org-2')[0].fileName).toBe('b.pdf');
  });

  it('matches resumed files by the raw stored name, not the sanitized name', () => {
    const pending = [
      {
        ...BASE,
        fileId: 'old-filepond-id',
        fileName: 'Capital Call (Q1).pdf',
        startedAt: 1,
      },
    ];

    const match = findPendingUploadMatch(pending, {
      fileId: 'new-filepond-id',
      fileName: 'Capital Call (Q1).pdf',
      fileType: 'application/pdf',
      fileSize: 1234,
    });

    expect(match?.fileId).toBe('old-filepond-id');
  });
});

describe('documents-upload-state - removal', () => {
  it('removes a single entry by fileId', () => {
    savePending('org-1', entry1);
    savePending('org-1', entry2);
    removePending('org-1', 'f1');
    const result = loadPending('org-1');
    expect(result).toHaveLength(1);
    expect(result[0].fileId).toBe('f2');
  });

  it('removes the localStorage key when removing the last entry', () => {
    savePending('org-1', entryF1);
    removePending('org-1', 'f1');
    expect(localStorage.getItem('documents_upload_pending_org-1')).toBeNull();
  });

  it('clears all pending for a specific org', () => {
    savePending('org-1', entryF1);
    savePending('org-2', entryF2);
    clearPending('org-1');
    expect(loadPending('org-1')).toEqual([]);
    expect(loadPending('org-2')).toHaveLength(1);
  });
});

describe('documents-upload-state - corrupt input', () => {
  it('returns empty array when stored value is corrupt JSON', () => {
    localStorage.setItem('documents_upload_pending_org-1', '{not json');
    expect(loadPending('org-1')).toEqual([]);
  });

  it('returns empty array when stored value is not an array', () => {
    const payload = JSON.stringify({ fileId: 'x' });
    localStorage.setItem('documents_upload_pending_org-1', payload);
    expect(loadPending('org-1')).toEqual([]);
  });

  it('filters out malformed entries within an otherwise valid array', () => {
    const payload = JSON.stringify([goodEntry, badEntry]);
    localStorage.setItem('documents_upload_pending_org-1', payload);
    const result = loadPending('org-1');
    expect(result).toHaveLength(1);
    expect(result[0].fileId).toBe('good');
  });
});
