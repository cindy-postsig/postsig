import {
  buildSafePath,
  PathTraversalError,
  sanitizeFileName,
} from '../helpers';

describe('buildSafePath', () => {
  describe('valid paths', () => {
    it('builds a path from valid segments', () => {
      const result = buildSafePath(['org-123', 'documents', 'file.pdf']);
      expect(result).toBe('org-123/documents/file.pdf');
    });

    it('handles single segment', () => {
      const result = buildSafePath(['filename.txt']);
      expect(result).toBe('filename.txt');
    });

    it('handles multiple nested segments', () => {
      const result = buildSafePath(['a', 'b', 'c', 'd', 'e', 'file.txt']);
      expect(result).toBe('a/b/c/d/e/file.txt');
    });

    it('allows underscores and hyphens', () => {
      const result = buildSafePath([
        'org_123',
        'my-folder',
        'file_name-v2.pdf',
      ]);
      expect(result).toBe('org_123/my-folder/file_name-v2.pdf');
    });

    it('allows numeric segments', () => {
      const result = buildSafePath(['123', '456', '789.txt']);
      expect(result).toBe('123/456/789.txt');
    });
  });

  describe('directory traversal attacks', () => {
    it('rejects double dot segments', () => {
      expect(() => buildSafePath(['folder', '..', 'etc'])).toThrow(
        PathTraversalError,
      );
    });

    it('rejects single dot segments', () => {
      expect(() => buildSafePath(['folder', '.', 'file.txt'])).toThrow(
        PathTraversalError,
      );
    });

    it('rejects double dot at start', () => {
      expect(() => buildSafePath(['..', 'etc', 'passwd'])).toThrow(
        PathTraversalError,
      );
    });

    it('rejects double dot at end', () => {
      expect(() => buildSafePath(['folder', 'subfolder', '..'])).toThrow(
        PathTraversalError,
      );
    });

    it('rejects embedded double dots in segment', () => {
      expect(() => buildSafePath(['folder', 'sub..dir', 'file.txt'])).toThrow(
        PathTraversalError,
      );
    });
  });

  describe('URL-encoded attacks', () => {
    it('rejects URL-encoded double dot (%2e%2e)', () => {
      expect(() => buildSafePath(['folder', '%2e%2e', 'file.txt'])).toThrow(
        PathTraversalError,
      );
    });

    it('rejects URL-encoded slash (%2f)', () => {
      expect(() => buildSafePath(['folder', 'sub%2fdir', 'file.txt'])).toThrow(
        PathTraversalError,
      );
    });

    it('rejects mixed encoding (%2e.)', () => {
      expect(() => buildSafePath(['folder', '%2e.', 'file.txt'])).toThrow(
        PathTraversalError,
      );
    });

    it('rejects URL-encoded backslash (%5c)', () => {
      expect(() => buildSafePath(['folder', 'sub%5cdir', 'file.txt'])).toThrow(
        PathTraversalError,
      );
    });
  });

  describe('null byte and control character attacks', () => {
    it('rejects null byte injection', () => {
      expect(() => buildSafePath(['folder', 'file.txt\x00.jpg'])).toThrow(
        PathTraversalError,
      );
    });

    it('rejects control characters', () => {
      expect(() => buildSafePath(['folder', 'file\x1f.txt'])).toThrow(
        PathTraversalError,
      );
    });

    it('rejects tab characters', () => {
      expect(() => buildSafePath(['folder', 'file\t.txt'])).toThrow(
        PathTraversalError,
      );
    });
  });

  describe('hidden files', () => {
    it('rejects hidden files by default', () => {
      expect(() => buildSafePath(['folder', '.htaccess'])).toThrow(
        PathTraversalError,
      );
    });

    it('rejects hidden folders by default', () => {
      expect(() => buildSafePath(['.git', 'config'])).toThrow(
        PathTraversalError,
      );
    });

    it('allows hidden files when option is enabled', () => {
      const result = buildSafePath(['folder', '.htaccess'], {
        allowHiddenFiles: true,
      });
      expect(result).toBe('folder/.htaccess');
    });
  });

  describe('empty and invalid segments', () => {
    it('rejects empty segments array', () => {
      expect(() => buildSafePath([])).toThrow(PathTraversalError);
    });

    it('rejects empty string segment', () => {
      expect(() => buildSafePath(['folder', '', 'file.txt'])).toThrow(
        PathTraversalError,
      );
    });

    it('rejects whitespace-only segment', () => {
      expect(() => buildSafePath(['folder', '   ', 'file.txt'])).toThrow(
        PathTraversalError,
      );
    });
  });

  describe('invalid characters', () => {
    it('rejects less than sign', () => {
      expect(() => buildSafePath(['folder', 'file<name.txt'])).toThrow(
        PathTraversalError,
      );
    });

    it('rejects greater than sign', () => {
      expect(() => buildSafePath(['folder', 'file>name.txt'])).toThrow(
        PathTraversalError,
      );
    });

    it('rejects colon', () => {
      expect(() => buildSafePath(['folder', 'file:name.txt'])).toThrow(
        PathTraversalError,
      );
    });

    it('rejects double quote', () => {
      expect(() => buildSafePath(['folder', 'file"name.txt'])).toThrow(
        PathTraversalError,
      );
    });

    it('rejects pipe', () => {
      expect(() => buildSafePath(['folder', 'file|name.txt'])).toThrow(
        PathTraversalError,
      );
    });

    it('rejects question mark', () => {
      expect(() => buildSafePath(['folder', 'file?name.txt'])).toThrow(
        PathTraversalError,
      );
    });

    it('rejects asterisk', () => {
      expect(() => buildSafePath(['folder', 'file*name.txt'])).toThrow(
        PathTraversalError,
      );
    });

    it('rejects backslash', () => {
      expect(() => buildSafePath(['folder', 'sub\\dir', 'file.txt'])).toThrow(
        PathTraversalError,
      );
    });
  });

  describe('length limits', () => {
    it('rejects segment exceeding max length', () => {
      const longSegment = 'a'.repeat(256);
      expect(() => buildSafePath(['folder', longSegment])).toThrow(
        PathTraversalError,
      );
    });

    it('allows segment at max length', () => {
      const maxSegment = 'a'.repeat(255);
      const result = buildSafePath(['folder', maxSegment]);
      expect(result).toBe(`folder/${maxSegment}`);
    });

    it('respects custom max segment length', () => {
      const segment = 'a'.repeat(50);
      expect(() =>
        buildSafePath(['folder', segment], { maxSegmentLength: 40 }),
      ).toThrow(PathTraversalError);
    });

    it('rejects path exceeding max total length', () => {
      const segments = Array(150).fill('segment');
      expect(() => buildSafePath(segments)).toThrow(PathTraversalError);
    });

    it('respects custom max total length', () => {
      expect(() =>
        buildSafePath(['folder', 'subfolder', 'file.txt'], {
          maxTotalLength: 10,
        }),
      ).toThrow(PathTraversalError);
    });
  });

  describe('absolute path prevention', () => {
    it('rejects paths starting with slash', () => {
      expect(() => buildSafePath(['/etc', 'passwd'])).toThrow(
        PathTraversalError,
      );
    });
  });

  describe('double slash prevention', () => {
    it('path cannot contain double slashes (handled by empty segment check)', () => {
      expect(() => buildSafePath(['folder', '', 'file.txt'])).toThrow(
        PathTraversalError,
      );
    });
  });
});

describe('sanitizeFileName', () => {
  it('preserves alphanumeric characters', () => {
    expect(sanitizeFileName('file123.pdf')).toBe('file123.pdf');
  });

  it('preserves dots, underscores, and hyphens', () => {
    expect(sanitizeFileName('my_file-v2.0.pdf')).toBe('my_file-v2.0.pdf');
  });

  it('replaces spaces with underscores', () => {
    expect(sanitizeFileName('my file.pdf')).toBe('my_file.pdf');
  });

  it('replaces special characters', () => {
    expect(sanitizeFileName('file@#$%.pdf')).toBe('file____.pdf');
  });

  it('replaces unicode characters', () => {
    expect(sanitizeFileName('文件.pdf')).toBe('__.pdf');
  });

  it('handles empty string', () => {
    expect(sanitizeFileName('')).toBe('');
  });
});
