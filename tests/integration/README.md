# tests/integration

Cordis integration tests (plan §53.3).

Build a minimal real Context with `tools` + a fake `credentials` provider,
load the plugin, and verify: plugin load, tool registration, tool execution,
plugin unload, tool unregister, credential resolution, write policy. This is
the layer that catches DeepSeek Harness API breaking changes.

Status: **implemented for the Milestone 2 read path** (plan §75):

- `plugin.test.ts` — a real `Context` + `ToolRuntime` + fake credentials
  provider loads the dsh-linear plugin and verifies:
  - the four read tools are registered (and write/list tools are not yet),
  - execution through the real pipeline reports `NOT_CONNECTED` when no
    credential is configured (full chain: args validation → service → auth),
  - `linear_connection_status` succeeds with `connected: false`,
  - schema-invalid arguments are rejected by the tool schema,
  - unloading the plugin unregisters every tool,
  - `authMode: oauth` mounts but reports an actionable Milestone 5 message.

Successful SDK-path execution is covered at the contract layer with a mocked
Linear client (plan §53.2); the real-Linear E2E lives in CI behind
`LINEAR_TEST_API_KEY` (plan §54).
