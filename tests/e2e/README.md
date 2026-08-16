# tests/e2e

Real Linear workspace end-to-end tests (plan §54, Milestone 7).

**Optional.** Every test in this directory skips itself unless the
`LINEAR_TEST_API_KEY` environment variable is set — a Personal API Key for a
**dedicated test workspace** (never a production key; plan §58). The regular
`vp test` run stays green without it.

```bash
LINEAR_TEST_API_KEY=<test-workspace-key> pnpm test:e2e
```

The connector exposes no delete tool (plan §11, §36), so the test cleans up
its own issue through the raw `@linear/sdk` afterwards. Test data uses a
unique `dsh-linear-e2e <timestamp>` title; the dedicated workspace is swept
periodically.

CI runs this on main / scheduled branches when the secret exists (plan §54)
— see `.github/workflows/ci.yml`.
