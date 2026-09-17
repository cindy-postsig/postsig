# MCP subdomain (`mcp.postsig.com`)

The MCP server lives at a dedicated subdomain so the public-facing URLs are
clean (`mcp.postsig.com/cpm`, `mcp.postsig.com/investor`) instead of leaking
the internal `/api/cpm/mcp` shape. Everything runs in the same Next.js app
and the same Vercel project — the subdomain is just routed there.

## How requests flow

1. Client (Claude.ai, Claude Code, MCP Inspector, etc.) hits
   `https://mcp.postsig.com/cpm`.
2. Vercel routes the request to this project because `mcp.postsig.com` is
   one of its configured domains.
3. The proxy (`proxy.ts`) detects the host via `isMcpHost()`. If the
   host matches one in `MCP_HOSTS`:
   - `/` → JSON discovery hint (`MCP_ROOT_RESPONSE`).
   - Path in `MCP_REWRITE_MAP` → `NextResponse.rewrite` to the internal
     route handler (`/cpm` → `/api/cpm/mcp`).
   - Anything else → `404` JSON. No app routes, no dashboard, no
     `_next/*` HTML — the MCP host is API-only.
4. The internal route handler at `app/api/cpm/mcp/route.ts` runs as usual.

The OAuth consent and login flows stay on the main app host
(`dev.postsig.com`, `app.postsig.com`). The MCP host never serves HTML.

## Configuration

| Env var        | Example                   | Purpose                                                   |
| -------------- | ------------------------- | --------------------------------------------------------- |
| `MCP_HOSTS`    | `mcp.postsig.com`         | Comma-separated allowlist of MCP hostnames                |
| `MCP_BASE_URL` | `https://mcp.postsig.com` | Canonical base used in `resource` + AS metadata documents |

Set both per environment. Production:

```env
MCP_HOSTS=mcp.postsig.com
MCP_BASE_URL=https://mcp.postsig.com
```

Staging:

```env
MCP_HOSTS=mcp-dev.postsig.com
MCP_BASE_URL=https://mcp-dev.postsig.com
```

If `MCP_BASE_URL` is unset, `canonicalResourceUrl` falls back to `APP_URL`,
which means resource URLs land on the main app host — useful for tests but
won't match what Vercel actually serves once the subdomain is live.

## Vercel domain setup

1. Project Settings → Domains → Add `mcp.postsig.com` to this project. No
   separate Vercel project needed.
2. DNS: CNAME `mcp.postsig.com` → `cname.vercel-dns.com`.
3. Vercel auto-provisions the cert. Preview deployments stay on
   `*.vercel.app` and are not affected by the subdomain routing.

## Adding a new MCP module

1. Add the route handler at `app/api/<module>/mcp/route.ts`.
2. Add the module to `MCP_MODULE_PATHS` in `app/lib/mcp/host-gate.ts`
   (single source — `MCP_REWRITE_MAP` and `canonicalResourceUrl()` both
   derive from it).
3. Add the module to `McpModule` in `app/lib/mcp/auth.ts` and
   `MCP_MODULE_SCOPES` in `app/lib/mcp/oauth-metadata.ts`.
4. Add a case to the allowlist test in
   `__tests__/mcp/host-gate.test.ts` — the test asserts the exact set of
   paths, so it will fail until the dev acknowledges the addition.

The allowlist test is intentionally strict. If something starts leaking
through to the MCP host (a new app route, a new API endpoint), the test
fails and forces a deliberate decision about whether it belongs there.

## Audience binding

`canonicalResourceUrl()` returns the public URL (e.g.
`https://mcp.postsig.com/cpm`). RFC 8707 requires the issued token's `aud`
to equal that URL, and `moduleFromResource` uses strict equality against
`canonicalResourceUrl()` for the same reason — a request with
`resource=https://attacker.com/cpm` should not surface "Read your CPM
data" on the consent screen.

## Local development

The subdomain doesn't exist on `localhost` by default. Three options:

1. **Skip the subdomain locally.** Leave `MCP_HOSTS` and `MCP_BASE_URL`
   unset. The gate doesn't fire on `localhost`, and you test MCP via the
   internal `/api/cpm/mcp` path as before. `canonicalResourceUrl` falls
   back to `APP_URL`, so tokens issued locally have audience
   `http://localhost:3000/cpm` — which will mismatch when you hit
   `/api/cpm/mcp` directly. Fine for unit tests, not for end-to-end OAuth.

2. **Use `mcp.localhost` via `/etc/hosts`.**

   ```hosts
   127.0.0.1 mcp.localhost
   ```

   Then set:

   ```env
   MCP_HOSTS=mcp.localhost:3000
   MCP_BASE_URL=http://mcp.localhost:3000
   ```

   Connect Claude/Inspector to `http://mcp.localhost:3000/cpm`. Closest to
   production behavior.

3. **Use the preview state in the consent playground.**
   `http://localhost:3000/oauth/consent/preview?state=interstitial_localhost`
   exercises the UI without driving a real OAuth flow.

## Preview deployments

`mcp.postsig.com` aliases only the production deployment. Vercel previews
get `*.vercel.app` URLs which won't match `MCP_HOSTS` — the gate won't
fire and the MCP routes are reachable via the old `/api/cpm/mcp` path. If
you want MCP-via-Claude testing on previews, set up a parallel
`mcp-preview.postsig.com` domain and add it to `MCP_HOSTS` for the
preview env.
