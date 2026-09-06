// Vitest alias target for the "server-only" package (see vitest*.config.mts).
// The real package throws unconditionally when loaded outside Next.js's
// bundler (it relies on webpack/Next resolving a different export condition
// for server code) — under plain Node it always throws, which would break
// every test that imports a lib/ module marked server-only. Next.js's own
// build still uses the real package, so the client-bundle safety net stays
// intact; this stub only affects `vitest run`.
export {};
