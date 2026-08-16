/**
 * Connector UX integration tests (plan §50–§52; Milestone 6).
 *
 * A minimal real Context (tools runtime + fake credentials + the dsh-settings
 * provider + the dsh-linear plugin) verifies:
 *
 * - the `linear` settings namespace is registered with the harness settings
 *   service (§26) and unregistered on plugin unload;
 * - assembly uses the resolved settings when the settings service is mounted
 *   first (user-document overrides reach the running plugin);
 * - the connection lifecycle service is provided as `linearConnector` (§50)
 *   and its status / disconnect actions behave against the fake credentials;
 * - the plugin still assembles headless (no settings service).
 */
import { expect, test } from "vite-plus/test";
import { Context } from "@deepseek-ai/cordis";
import { ToolRuntime } from "@deepseek-ai/dsh-tools";
import { SettingsProvider, type SettingsNamespace } from "@deepseek-ai/dsh-settings";
import { apply, inject, name } from "../../src/harness/plugin.ts";
import type { LinearConnectionServiceLike } from "../../src/linear/services/connection-service.ts";

const ALL_TOOLS = [
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
  "linear_create_issue",
  "linear_update_issue",
  "linear_add_comment",
  "linear_create_attachment",
  "linear_create_status_update",
  "linear_create_initiative",
  "linear_create_release",
  "linear_create_customer",
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
  "linear_prepare_attachment_upload",
  "linear_create_attachment_from_upload",
  "linear_upload_attachment_file",
];

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

/** Minimal in-memory settings provider (dsh-settings service definition). */
class MemorySettings extends SettingsProvider {
  static doc: Record<string, unknown> = {};

  readonly writable = true;

  protected async load() {
    return MemorySettings.doc;
  }

  protected async persist(ns: SettingsNamespace, section: Record<string, unknown>) {
    MemorySettings.doc[ns] = section;
  }
}

async function setup(
  options: {
    authMode?: "oauth" | "apiKey";
    credentialRef?: string;
    userSection?: Record<string, unknown>;
    seedCredential?: [string, string];
    /** Fake webServer provided to the context (host/port/register+disposer). */
    withWebServer?: unknown;
    /** Extra plugin config fields (e.g. OAuth app credentials). */
    pluginConfig?: Record<string, unknown>;
  } = {},
) {
  const ctx = new Context();
  ctx.provide("systemPrompt" as never, fakeSystemPrompt() as never);
  // Mount the providers BEFORE the connector and await them: a plugin fiber
  // whose injects arrive late is still "loading" right after
  // `await ctx.plugin(...)`, and strict service reads hide its provides
  // until it settles. Awaiting the providers makes the connector fiber start
  // loading synchronously, so the await below guarantees a settled fiber.
  await ctx.plugin(ToolRuntime);
  const credentials = fakeCredentials();
  ctx.provide("credentials" as never, credentials as never);
  if (options.seedCredential) {
    credentials.values.set(options.seedCredential[0], options.seedCredential[1]);
  }
  MemorySettings.doc = options.userSection ? { linear: options.userSection } : {};
  await ctx.plugin(MemorySettings);
  if (options.withWebServer) {
    ctx.provide("webServer" as never, options.withWebServer as never);
  }
  const fiber = await ctx.plugin({ name, inject, apply }, {
    authMode: options.authMode ?? "oauth",
    credentialRef: options.credentialRef ?? "DSH_LINEAR_OAUTH",
    ...options.pluginConfig,
  } as never);
  return { ctx, fiber, credentials };
}

// ----------------------------------------------------------------- settings

test("the linear settings namespace is registered with the settings service", async () => {
  const { ctx, fiber } = await setup();
  const descriptors = ctx.settings.describe();
  const linear = descriptors.find((descriptor) => descriptor.ns === "linear");
  expect(linear).toBeDefined();
  expect((linear!.value as Record<string, unknown>).authMode).toBe("oauth");
  expect((linear!.value as Record<string, unknown>).writePolicy).toBe("ask");
  for (const toolName of ALL_TOOLS) {
    expect(ctx.tools.get(toolName)).toBeDefined();
  }
  await fiber.dispose();
});

test("unloading the plugin unregisters the settings namespace", async () => {
  const { ctx, fiber } = await setup();
  expect(ctx.settings.describe().some((descriptor) => descriptor.ns === "linear")).toBe(true);
  await fiber.dispose();
  expect(ctx.settings.describe().some((descriptor) => descriptor.ns === "linear")).toBe(false);
});

test("a user-document override reaches the running plugin when settings mount first", async () => {
  // Entry config says oauth; the user document overrides authMode → apiKey.
  // Assembly happens from the resolved settings, so the provided connection
  // service must report the overridden mode (plan §26).
  const { ctx, fiber } = await setup({ userSection: { authMode: "apiKey" } });
  const connector = ctx.get("linearConnector") as LinearConnectionServiceLike;
  expect(connector.mode).toBe("apiKey");
  const linear = ctx.settings.describe().find((descriptor) => descriptor.ns === "linear");
  expect((linear!.value as Record<string, unknown>).authMode).toBe("apiKey");
  await fiber.dispose();
});

test("settings changes are persisted and announced with restart semantics", async () => {
  const { ctx, fiber } = await setup();
  await ctx.settings.update("linear" as never, { defaultTeam: "Engineering" });
  const linear = ctx.settings.describe().find((descriptor) => descriptor.ns === "linear");
  expect((linear!.value as Record<string, unknown>).defaultTeam).toBe("Engineering");
  await fiber.dispose();
});

// -------------------------------------------------------- connection service

test("the connector service is provided and reports disconnected with guidance", async () => {
  const { ctx, fiber } = await setup({ authMode: "apiKey" });
  const connector = ctx.get("linearConnector") as LinearConnectionServiceLike;
  expect(connector.getState()).toBe("disconnected");
  const status = await connector.getConnectionStatus();
  expect(status.connected).toBe(false);
  expect(status.authMode).toBe("apiKey");
  expect(status.state).toBe("disconnected");
  expect(status.message).toContain("DSH_LINEAR_API_KEY");
  await fiber.dispose();
});

test("connector.disconnect removes the stored API key credential (plan §51)", async () => {
  const { ctx, fiber, credentials } = await setup({
    authMode: "apiKey",
    credentialRef: "DSH_LINEAR_API_KEY",
    seedCredential: ["DSH_LINEAR_API_KEY", "lin_api_sekret"],
  });
  const connector = ctx.get("linearConnector") as LinearConnectionServiceLike;
  expect(credentials.values.has("DSH_LINEAR_API_KEY")).toBe(true);
  await connector.disconnect();
  expect(credentials.values.has("DSH_LINEAR_API_KEY")).toBe(false);
  expect(connector.getState()).toBe("disconnected");
  await fiber.dispose();
});

test("the plugin still assembles without a settings service (headless, plan §23)", async () => {
  const ctx = new Context();
  ctx.provide("systemPrompt" as never, fakeSystemPrompt() as never);
  await ctx.plugin(ToolRuntime);
  ctx.provide("credentials" as never, fakeCredentials() as never);
  // No MemorySettings mounted: the fallback path assembles from the entry.
  const fiber = await ctx.plugin({ name, inject, apply }, {
    authMode: "apiKey",
    credentialRef: "DSH_LINEAR_API_KEY",
  } as never);
  const connector = ctx.get("linearConnector") as LinearConnectionServiceLike;
  expect(connector.mode).toBe("apiKey");
  for (const toolName of ALL_TOOLS) {
    expect(ctx.tools.get(toolName)).toBeDefined();
  }
  await fiber.dispose();
});

// ------------------------------------------------------- live switching (M7)

test("live settings change swaps the auth stack without restart", async () => {
  const { ctx, fiber } = await setup({ authMode: "oauth" });
  const before = ctx.get("linearConnector") as LinearConnectionServiceLike;
  expect(before.mode).toBe("oauth");

  // The user document flips authMode → apiKey: with applies: "live" the
  // running stack must rebuild immediately (no unload / reload).
  await ctx.settings.update("linear" as never, { authMode: "apiKey" });

  const after = ctx.get("linearConnector") as LinearConnectionServiceLike;
  expect(after).not.toBe(before);
  expect(after.mode).toBe("apiKey");
  for (const toolName of ALL_TOOLS) {
    expect(ctx.tools.get(toolName)).toBeDefined();
  }
  await fiber.dispose();
});

test("live settings change re-registers web routes without duplicates", async () => {
  const routes: Array<{ kind: string; path: string }> = [];
  const fakeWebServer = {
    host: "127.0.0.1",
    port: 8765,
    register(route: { kind: string; path: string }) {
      routes.push(route);
      return () => {
        const index = routes.indexOf(route);
        if (index >= 0) routes.splice(index, 1);
      };
    },
  };
  const { ctx, fiber } = await setup({
    authMode: "oauth",
    withWebServer: fakeWebServer,
    pluginConfig: {
      oauthClientId: "linear-client-1",
      redirectUri: "http://127.0.0.1:8765/integrations/linear/oauth/callback",
    },
  });
  expect(routes.map((route) => route.path)).toEqual([
    "/integrations/linear/oauth/callback",
    "/integrations/linear/api/status",
    "/integrations/linear/api/connect",
    "/integrations/linear/api/reconnect",
    "/integrations/linear/api/disconnect",
    "/integrations/linear/api/settings",
  ]);

  // oauth → apiKey: the callback route must be disposed (apiKey mode does
  // not register it) and the API routes re-registered — if the old routes
  // leaked, the re-registration would throw "duplicate exact route".
  await ctx.settings.update("linear" as never, { authMode: "apiKey" });

  expect(routes.map((route) => route.path)).toEqual([
    "/integrations/linear/api/status",
    "/integrations/linear/api/connect",
    "/integrations/linear/api/reconnect",
    "/integrations/linear/api/disconnect",
    "/integrations/linear/api/settings",
  ]);

  await fiber.dispose();
  expect(routes).toEqual([]);
});
