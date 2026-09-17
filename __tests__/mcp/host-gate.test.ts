import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import {
  MCP_REWRITE_MAP,
  MCP_ROOT_RESPONSE,
  getMcpHosts,
  isMcpHost,
} from '@/app/lib/mcp/host-gate';

describe('MCP host gate', () => {
  const originalHosts = process.env.MCP_HOSTS;

  beforeEach(() => {
    process.env.MCP_HOSTS = 'mcp.postsig.com,mcp.localhost:3000';
  });

  afterEach(() => {
    if (originalHosts === undefined) {
      delete process.env.MCP_HOSTS;
    } else {
      process.env.MCP_HOSTS = originalHosts;
    }
  });

  describe('isMcpHost', () => {
    it('matches configured hosts case-insensitively', () => {
      expect(isMcpHost('mcp.postsig.com')).toBe(true);
      expect(isMcpHost('MCP.PostSig.com')).toBe(true);
      expect(isMcpHost('mcp.localhost:3000')).toBe(true);
    });

    it('rejects non-MCP hosts', () => {
      expect(isMcpHost('dev.postsig.com')).toBe(false);
      expect(isMcpHost('postsig.com')).toBe(false);
      expect(isMcpHost('attacker.com')).toBe(false);
      expect(isMcpHost(null)).toBe(false);
      expect(isMcpHost(undefined)).toBe(false);
      expect(isMcpHost('')).toBe(false);
    });

    it('returns false when MCP_HOSTS is empty', () => {
      process.env.MCP_HOSTS = '';
      expect(isMcpHost('mcp.postsig.com')).toBe(false);
    });
  });

  describe('getMcpHosts', () => {
    it('trims whitespace and lowercases', () => {
      process.env.MCP_HOSTS = '  MCP.Postsig.com , mcp-staging.postsig.com ';
      const hosts = getMcpHosts();
      expect(hosts.has('mcp.postsig.com')).toBe(true);
      expect(hosts.has('mcp-staging.postsig.com')).toBe(true);
    });

    it('ignores empty entries', () => {
      process.env.MCP_HOSTS = 'mcp.postsig.com,,';
      expect(getMcpHosts().size).toBe(1);
    });
  });

  // Strict allowlist — adding a new MCP module must update this test in
  // lockstep, forcing a deliberate choice about what's reachable on the host.
  describe('MCP_REWRITE_MAP allowlist', () => {
    it('exposes exactly the expected public paths', () => {
      expect(Object.keys(MCP_REWRITE_MAP).sort()).toEqual([
        '/.well-known/oauth-protected-resource/cpm',
        '/.well-known/oauth-protected-resource/investor',
        '/cpm',
        '/investor',
      ]);
    });

    it('maps each public path to its internal route handler', () => {
      expect(MCP_REWRITE_MAP['/cpm']).toBe('/api/cpm/mcp');
      expect(MCP_REWRITE_MAP['/investor']).toBe('/api/investor/mcp');
      expect(MCP_REWRITE_MAP['/.well-known/oauth-protected-resource/cpm']).toBe(
        '/.well-known/oauth-protected-resource/api/cpm/mcp',
      );
      expect(
        MCP_REWRITE_MAP['/.well-known/oauth-protected-resource/investor'],
      ).toBe('/.well-known/oauth-protected-resource/api/investor/mcp');
    });

    it('rejects paths a curious caller might try', () => {
      for (const p of [
        '/api/cpm/mcp',
        '/api/investor/mcp',
        '/dashboard',
        '/login',
        '/oauth/consent',
        '/investor/portfolio',
        '/.well-known/oauth-authorization-server',
        '/_next/data/anything',
      ]) {
        expect(MCP_REWRITE_MAP[p]).toBeUndefined();
      }
    });
  });

  describe('MCP_ROOT_RESPONSE', () => {
    it('advertises the public endpoints', () => {
      expect(MCP_ROOT_RESPONSE.endpoints.cpm).toBe('/cpm');
      expect(MCP_ROOT_RESPONSE.endpoints.investor).toBe('/investor');
    });
  });
});
