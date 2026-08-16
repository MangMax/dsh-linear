# tests/smoke

Harness package smoke tests (plan §53.4, §48).

`tests/smoke/package-exports.test.ts` verifies the public entry surface.
The REAL install smoke — build the tgz, create a temporary `DSH_HOME`, run
`dsh plugin add <tgz>`, boot Harness, and assert the plugin loads and its
tools exist — runs in CI (Milestone 1 acceptance, plan §75) and cannot be
replaced by a TypeScript compile.
