/**
 * Cordis integration tests (plan §53.3).
 *
 * A minimal real Context: the dsh-tools runtime, a fake credentials
 * provider, and the dsh-linear plugin. Verifies plugin load, tool
 * registration, tool execution through the real pipeline, credential
 * resolution, the pipeline-level write gate (§37), and unload →
 * unregister.
 *
 * Execution with no credential exercises the full chain — argument
 * validation → domain service → auth resolve → NOT_CONNECTED — without
 * network access. Successful SDK-path execution is covered at the contract
 * layer with a mocked Linear client (plan §53.2).
 */
import { expect, test } from "vite-plus/test";
import { Context } from "@deepseek-ai/cordis";
import { ToolRuntime } from "@deepseek-ai/dsh-tools";
import { apply, inject, name } from "../../src/harness/plugin.ts";

const READ_TOOLS = [
  "linear_connection_status",
  "linear_search_issues",
  "linear_get_issue",
  "linear_get_issue_context",
  "linear_list_projects",
  "linear_get_project",
  "linear_list_teams",
  "linear_get_team",
  "linear_list_cycles",
  "linear_list_users",
  "linear_get_user",
  "linear_list_issue_statuses",
  "linear_list_issue_labels",
  "linear_list_comments",
  "linear_list_attachments",
  "linear_get_profile",
  "linear_list_documents",
  "linear_get_document",
  "linear_list_status_updates",
  "linear_get_status_update",
  "linear_list_milestones",
  "linear_get_milestone",
  "linear_list_initiatives",
  "linear_get_initiative",
  "linear_list_initiative_labels",
  "linear_list_releases",
  "linear_get_release",
  "linear_list_release_pipelines",
  "linear_list_release_notes",
  "linear_get_release_note",
  "linear_list_customers",
  "linear_get_customer",
  "linear_get_issue_status",
];

const WRITE_TOOLS = [
  "linear_create_issue",
  "linear_update_issue",
  "linear_add_comment",
  "linear_create_attachment",
  "linear_create_status_update",
  "linear_create_initiative",
  "linear_create_release",
  "linear_delete_attachment",
  "linear_delete_comment",
  "linear_delete_customer",
  "linear_delete_customer_need",
  "linear_delete_status_update",
  "linear_update_comment",
  "linear_update_customer",
  "linear_update_status_update",
  "linear_create_issue_label",
  "linear_create_initiative_label",
  "linear_create_milestone",
  "linear_update_milestone",
];

const ALL_TOOLS = [...READ_TOOLS, ...WRITE_TOOLS];

function fakeSystemPrompt() {
  return {
    tools: () => () => {},
    section: () => () => {},
  };
}

function fakeCredentials() {
  const values = new Map<string, string>();
  return {
    values,
    async resolve(ref: unknown) {
      const value = values.get(String(ref));
      return value ? { value, source: "env" } : undefined;
    },
    async describe(ref: unknown) {
      return { configured: values.has(String(ref)), writable: true };
    },
    async set(ref: unknown, value: string) {
      values.set(String(ref), value);
    },
    async unset(ref: unknown) {
      values.delete(String(ref));
    },
  };
}

async function setup() {
  const ctx = new Context();
  ctx.provide("systemPrompt" as never, fakeSystemPrompt() as never);
  ctx.plugin(ToolRuntime);
  const credentials = fakeCredentials();
  ctx.provide("credentials" as never, credentials as never);
  // ctx.plugin() returns Fiber & PromiseLike<Fiber>: awaiting it waits for the
  // fiber to reach ACTIVE (services injected, effect run, tools registered).
  const fiber = await ctx.plugin({ name, inject, apply }, {
    authMode: "apiKey",
    credentialRef: "DSH_LINEAR_API_KEY",
    writePolicy: "ask",
  } as never);
  return { ctx, fiber, credentials };
}

type ExecuteCallId = Parameters<ToolRuntime["execute"]>[0]["callId"];

function callId(id: string): ExecuteCallId {
  return id as unknown as ExecuteCallId;
}

test("plugin loads and registers the eleven tools (8 read + 3 write)", async () => {
  const { ctx, fiber } = await setup();
  for (const toolName of ALL_TOOLS) {
    expect(ctx.tools.get(toolName)).toBeDefined();
  }
  await fiber.dispose();
});

test("read tools execute through the real pipeline and report NOT_CONNECTED", async () => {
  const { ctx, fiber } = await setup();
  const result = await ctx.tools.execute({
    callId: callId("c1"),
    name: "linear_get_issue",
    arguments: { issue: "ENG-123" },
    signal: AbortSignal.timeout(5000),
  });
  expect(result.isError).toBe(true);
  if (result.isError) {
    expect(result.error.message).toContain("not connected");
  }
  await fiber.dispose();
});

test("connection status executes without a credential and reports disconnected", async () => {
  const { ctx, fiber } = await setup();
  const result = await ctx.tools.execute({
    callId: callId("c2"),
    name: "linear_connection_status",
    arguments: {},
    signal: AbortSignal.timeout(5000),
  });
  expect(result.isError).toBe(false);
  if (!result.isError) {
    expect(result.value).toMatchObject({ connected: false, authMode: "apiKey" });
  }
  await fiber.dispose();
});

test("invalid arguments are rejected by the tool schema", async () => {
  const { ctx, fiber } = await setup();
  const result = await ctx.tools.execute({
    callId: callId("c3"),
    name: "linear_get_issue",
    arguments: { issue: 42 },
    signal: AbortSignal.timeout(5000),
  });
  expect(result.isError).toBe(true);
  await fiber.dispose();
});

test("unloading the plugin unregisters every tool", async () => {
  const { ctx, fiber } = await setup();
  for (const toolName of ALL_TOOLS) {
    expect(ctx.tools.get(toolName)).toBeDefined();
  }
  await fiber.dispose();
  for (const toolName of ALL_TOOLS) {
    expect(ctx.tools.get(toolName)).toBeUndefined();
  }
});

test("write tools ask by default and fail closed without an approval service", async () => {
  const { ctx, fiber } = await setup();
  const result = await ctx.tools.execute({
    callId: callId("c5"),
    name: "linear_create_issue",
    arguments: { title: "Spam", team: "Engineering" },
    signal: AbortSignal.timeout(5000),
  });
  expect(result.isError).toBe(true);
  if (result.isError) {
    // The gate returns `ask`; without a composed approval service the
    // registry denies with the ask reason (fail closed, plan §37).
    expect(result.error.message).toContain("modifies Linear data");
    expect(result.error.message).toContain("approve");
  }
  await fiber.dispose();
});

test("read tools are not gated while writePolicy is ask", async () => {
  const { ctx, fiber } = await setup();
  const result = await ctx.tools.execute({
    callId: callId("c6"),
    name: "linear_search_issues",
    arguments: { query: "login" },
    signal: AbortSignal.timeout(5000),
  });
  expect(result.isError).toBe(true);
  if (result.isError) {
    // Reached the domain layer (no credential) instead of the write gate.
    expect(result.error.message).toContain("not connected");
  }
  await fiber.dispose();
});

test("writePolicy deny blocks write tools with the deny reason", async () => {
  const ctx = new Context();
  ctx.provide("systemPrompt" as never, fakeSystemPrompt() as never);
  ctx.plugin(ToolRuntime);
  ctx.provide("credentials" as never, fakeCredentials() as never);
  const fiber = await ctx.plugin({ name, inject, apply }, {
    authMode: "apiKey",
    credentialRef: "DSH_LINEAR_API_KEY",
    writePolicy: "deny",
  } as never);
  const result = await ctx.tools.execute({
    callId: callId("c7"),
    name: "linear_add_comment",
    arguments: { issue: "ENG-123", body: "hi" },
    signal: AbortSignal.timeout(5000),
  });
  expect(result.isError).toBe(true);
  if (result.isError) {
    expect(result.error.message).toContain("writePolicy is set to deny");
  }
  await fiber.dispose();
});

test("writePolicy allow lets write tools reach the domain layer", async () => {
  const ctx = new Context();
  ctx.provide("systemPrompt" as never, fakeSystemPrompt() as never);
  ctx.plugin(ToolRuntime);
  ctx.provide("credentials" as never, fakeCredentials() as never);
  const fiber = await ctx.plugin({ name, inject, apply }, {
    authMode: "apiKey",
    credentialRef: "DSH_LINEAR_API_KEY",
    writePolicy: "allow",
  } as never);
  const result = await ctx.tools.execute({
    callId: callId("c8"),
    name: "linear_update_issue",
    arguments: { issue: "ENG-123", title: "New title" },
    signal: AbortSignal.timeout(5000),
  });
  expect(result.isError).toBe(true);
  if (result.isError) {
    // Passed the gate; the domain layer reports the missing credential.
    expect(result.error.message).toContain("not connected");
  }
  await fiber.dispose();
});

test("oauth mode with no stored bundle reports an actionable NOT_CONNECTED", async () => {
  const ctx = new Context();
  ctx.provide("systemPrompt" as never, fakeSystemPrompt() as never);
  ctx.plugin(ToolRuntime);
  ctx.provide("credentials" as never, fakeCredentials() as never);
  const fiber = await ctx.plugin({ name, inject, apply }, {
    authMode: "oauth",
    credentialRef: "DSH_LINEAR_OAUTH",
  } as never);
  const result = await ctx.tools.execute({
    callId: callId("c4"),
    name: "linear_get_issue",
    arguments: { issue: "ENG-123" },
    signal: AbortSignal.timeout(5000),
  });
  expect(result.isError).toBe(true);
  if (result.isError) {
    // The M5 OAuth provider replaces the M2 placeholder: no bundle stored →
    // NOT_CONNECTED with the API-key fallback mentioned (plan §16, §23).
    expect(result.error.message).toContain("not connected");
    expect(result.error.message).toContain("apiKey");
  }
  await fiber.dispose();
});

test("oauth mode registers the callback route when webServer and client config exist", async () => {
  const routes: Array<{ kind: string; path: string }> = [];
  const fakeWebServer = {
    host: "127.0.0.1",
    port: 8765,
    register(route: { kind: string; path: string }) {
      routes.push({ kind: route.kind, path: route.path });
      return () => {};
    },
  };
  const ctx = new Context();
  ctx.provide("systemPrompt" as never, fakeSystemPrompt() as never);
  ctx.plugin(ToolRuntime);
  ctx.provide("credentials" as never, fakeCredentials() as never);
  ctx.provide("webServer" as never, fakeWebServer as never);
  const fiber = await ctx.plugin({ name, inject, apply }, {
    authMode: "oauth",
    credentialRef: "DSH_LINEAR_OAUTH",
    oauthClientId: "linear-client-1",
    redirectUri: "http://127.0.0.1:8765/integrations/linear/oauth/callback",
  } as never);

  expect(routes).toEqual([
    { kind: "exact", path: "/integrations/linear/oauth/callback" },
    { kind: "exact", path: "/integrations/linear/api/status" },
    { kind: "exact", path: "/integrations/linear/api/connect" },
    { kind: "exact", path: "/integrations/linear/api/reconnect" },
    { kind: "exact", path: "/integrations/linear/api/disconnect" },
    { kind: "exact", path: "/integrations/linear/api/settings" },
  ]);
  await fiber.dispose();
});

test("oauth mode without webServer still loads (headless profile, plan §23)", async () => {
  const ctx = new Context();
  ctx.provide("systemPrompt" as never, fakeSystemPrompt() as never);
  ctx.plugin(ToolRuntime);
  ctx.provide("credentials" as never, fakeCredentials() as never);
  const fiber = await ctx.plugin({ name, inject, apply }, {
    authMode: "oauth",
    credentialRef: "DSH_LINEAR_OAUTH",
    oauthClientId: "linear-client-1",
    redirectUri: "http://127.0.0.1:8765/integrations/linear/oauth/callback",
  } as never);
  for (const toolName of ALL_TOOLS) {
    expect(ctx.tools.get(toolName)).toBeDefined();
  }
  await fiber.dispose();
});
