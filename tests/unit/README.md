# tests/unit

Unit tests (plan §53.1) — no Harness, no Linear.

Pure logic under test:

- `pagination.test.ts` — page-size clamping (default 20 / cap 50)
- `issue.test.ts` — priority label / value mapping
- `token-store.test.ts` — OAuth token bundle single-secret roundtrip
- `oauth-state.test.ts` — PKCE state store TTL / consume-once
- `token-refresh.test.ts` — refresh single-flight (plan §22)
- `write-policy.test.ts` — read allow / write ask|allow|deny (plan §36)
- `error.test.ts` — `LinearConnectorError` factories (plan §35)
- `api-key-provider.test.ts` — credential resolution via `SecretStore`
- `resolver.test.ts` — §14.1 match priority (exact ID → key/email → exact
  name → case-insensitive → unique normalized), ambiguity with candidate
  lists, NOT_FOUND, project reference parsing (name / ID / URL), §14.2
  catalog cache (TTL expiry, page exhaustion, single-flight, failures not
  cached)
