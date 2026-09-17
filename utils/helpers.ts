/**
 * Sanitizes a file name by replacing invalid characters.
 * Allows letters, numbers, dots, underscores, and hyphens.
 * Replaces other characters with underscores.
 * @param fileName The original file name.
 * @returns The sanitized file name.
 */
export const sanitizeFileName = (fileName: string): string => {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
};

class PathTraversalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathTraversalError';
  }
}

interface SafePathOptions {
  allowHiddenFiles?: boolean;
  maxSegmentLength?: number;
  maxTotalLength?: number;
}

const DEFAULT_OPTIONS: Required<SafePathOptions> = {
  allowHiddenFiles: false,
  maxSegmentLength: 255,
  maxTotalLength: 1024,
};

const isValidPathSegment = (
  segment: string,
  options: Required<SafePathOptions>,
): boolean => {
  if (!segment || segment.length === 0) return false;
  if (segment.trim().length === 0) return false;
  if (segment.length > options.maxSegmentLength) return false;
  if (segment === '.' || segment === '..') return false;
  if (!options.allowHiddenFiles && segment.startsWith('.')) return false;

  try {
    const decoded = decodeURIComponent(segment);
    if (decoded === '.' || decoded === '..' || decoded.includes('..'))
      return false;
    if (decoded.includes('/') || decoded.includes('\\')) return false;
  } catch {
    return false;
  }

  const hasInvalidChars = /[<>:"|?*\x00-\x1f\\]/.test(segment);
  if (hasInvalidChars) return false;

  return true;
};

export const buildSafePath = (
  segments: string[],
  options: SafePathOptions = {},
): string => {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (segments.length === 0) {
    throw new PathTraversalError('Path must have at least one segment');
  }

  for (const segment of segments) {
    if (!isValidPathSegment(segment, opts)) {
      throw new PathTraversalError(`Invalid path segment: ${segment}`);
    }
  }

  const path = segments.join('/');

  if (path.length > opts.maxTotalLength) {
    throw new PathTraversalError('Path exceeds maximum length');
  }

  if (path.includes('..') || path.includes('//') || path.startsWith('/')) {
    throw new PathTraversalError('Path traversal attempt detected');
  }

  return path;
};

export { PathTraversalError };

/** * Normalizes a given URL by ensuring it has a scheme.
 * If the URL lacks a scheme but resembles a domain, 'https://' is prepended.
 * @param raw The raw URL string.
 * @returns The normalized URL.
 */
export const normalizeUrl = (raw: string): string => {
  if (!raw) return raw;
  const url = raw.trim();

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url)) return url;

  const domainLike = /^[\w.-]+\.[a-zA-Z]{2,}([/?#].*)?$/;
  if (domainLike.test(url)) {
    return `https://${url}`;
  }
  return url;
};

/** * Validates whether a given string is a valid URL.
 * Accepts URLs with schemes, protocol-relative URLs, and bare domains.
 * @param raw The raw URL string.
 * @returns True if valid URL, false otherwise.
 */
export const isValidUrl = (raw: string): boolean => {
  if (!raw) return false;
  const url = raw.trim();
  if (/\s/.test(url)) return false;

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url)) {
    return true;
  }
  if (url.startsWith('//')) {
    return true;
  }
  const domainLike = /^[\w.-]+\.[a-zA-Z]{2,}([/?#].*)?$/;
  if (domainLike.test(url)) {
    return true;
  }
  return false;
};
