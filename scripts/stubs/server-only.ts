// Stands in for the `server-only` package when a script runs outside Next.js:
// the real module throws on import so client bundles cannot pull server code,
// which is exactly right in the app and exactly wrong under tsx.
export {};
