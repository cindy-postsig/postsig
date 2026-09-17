/**
 * `server-only` guards the *bundler*: its real entry point throws on import so a
 * Client Component can never pull a server module into the browser bundle. Jest
 * runs in Node with no `react-server` export condition, so that guard would fail
 * every suite that touches a server module. Mapping it to this no-op keeps the
 * build-time boundary intact while letting the modules stay unit-testable.
 */
export {};
