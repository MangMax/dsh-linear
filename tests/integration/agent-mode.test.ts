/**
 * Agent Mode integration tests (plan §41–§43; Milestone 8).
 *
 * The plugin wired with `agentMode: true` on a real Cordis Context: the
 * webhook route is registered (after the state store is ready), a signed
 * `AgentSessionEvent` request flows through the real `LinearWebhookClient`
 * verification into the bridge, and the bridge degrades honestly when the
 * profile has no harness agent registry (no `agents` service here) — the
 * mirror fails silently, the route still answers 200. Also verifies the
 * `linearAgent` service and the agentMode=false default.
 */
import { expect, test } from "vite-plus/test";
import { createHmac } from "node:crypto";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Context } from "@deepseek-ai/cordis";
import { ToolRuntime } from "@deepseek-ai/dsh-tools";
import { apply, inject, name } from "../../src/harness/plugin.ts";
import { WEBHOOK_PATH } from "../../src/agent/webhook.ts";

const SECRET = "integration-webhook-secret";

function fakeSystemPrompt() {
  return {
    tools: () => () => {},
    section: () => () => {},
  };
}

function fakeCredentials(secret?: string) {
  const values = new Map<string, string>();
  if (secret) values.set("DSH_LINEAR_WEBHOOK_SECRET", secret);
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

/** Web server fake that records exact-route handlers by path. */
function fakeWebServer() {
  const routes: Array<{ kind: string; path: string }> = [];
  const handlers = new Map<
    string,
    (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  >();
  const server = {
    host: "127.0.0.1",
    port: 8765,
    register(route: {
      kind: string;
      path: string;
      handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
    }) {
      routes.push({ kind: route.kind, path: route.path });
      handlers.set(route.path, route.handler);
      return () => {
        const index = routes.findIndex((r) => r.path === route.path);
        if (index >= 0) routes.splice(index, 1);
        handlers.delete(route.path);
      };
    },
  };
  return { server, routes, handlers };
}

function signedEventReq(action: string): {
  req: IncomingMessage;
  res: ServerResponse & { body(): string };
} {
  const body = JSON.stringify({
    type: "AgentSessionEvent",
    webhookTimestamp: Date.now(),
    webhookId: "wh-1",
    organizationId: "org-1",
    oauthClientId: "client-1",
    appUserId: "app-user-1",
    action,
    createdAt: new Date().toISOString(),
    agentSession: { id: "lin-session-1", issue: { id: "issue-1" } },
    promptContext: "Fix this issue",
  });
  const signature = createHmac("sha256", SECRET).update(body).digest("hex");
  const stream = Readable.from([Buffer.from(body)]);
  const req = Object.assign(stream, {
    url: WEBHOOK_PATH,
    method: "POST",
    headers: { "linear-signature": signature, "content-type": "application/json" },
  }) as unknown as IncomingMessage;
  const chunks: string[] = [];
  const res = {
    statusCode: 0,
    setHeader() {},
    end(payload?: unknown) {
      if (typeof payload === "string") chunks.push(payload);
    },
    body() {
      return chunks.join("");
    },
  } as unknown as ServerResponse & { body(): string };
  return { req, res };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

async function setup(overrides: Record<string, unknown> = {}) {
  const ctx = new Context();
  ctx.provide("systemPrompt" as never, fakeSystemPrompt() as never);
  ctx.plugin(ToolRuntime);
  const credentials = fakeCredentials(SECRET);
  ctx.provide("credentials" as never, credentials as never);
  const web = fakeWebServer();
  ctx.provide("webServer" as never, web.server as never);
  const fiber = await ctx.plugin({ name, inject, apply }, {
    authMode: "oauth",
    actorMode: "app",
    credentialRef: "DSH_LINEAR_OAUTH",
    oauthClientId: "linear-client-1",
    redirectUri: "http://127.0.0.1:8765/integrations/linear/oauth/callback",
    agentMode: true,
    ...overrides,
  } as never);
  await settle(); // state store ready → webhook route registered
  return { ctx, fiber, ...web, credentials };
}

test("agent mode registers the webhook route and a signed event answers 200", async () => {
  const { handlers, fiber, ctx } = await setup();

  expect(handlers.has(WEBHOOK_PATH)).toBe(true);
  expect(ctx.get("linearAgent")).toBeDefined();

  const { req, res } = signedEventReq("created");
  await handlers.get(WEBHOOK_PATH)!(req, res);

  // The bridge ran (mirror best-effort — no agents service here, no Linear
  // credential — everything is contained); the route still answered 200.
  expect(res.statusCode).toBe(200);
  await fiber.dispose();
});

test("agent mode off (default) registers no webhook route", async () => {
  const { handlers, fiber } = await setup({ agentMode: false });

  expect(handlers.has(WEBHOOK_PATH)).toBe(false);
  await fiber.dispose();
});

test("agent mode without an OAuth app registers no webhook route", async () => {
  const { handlers, fiber } = await setup({ oauthClientId: undefined, redirectUri: undefined });

  expect(handlers.has(WEBHOOK_PATH)).toBe(false);
  await fiber.dispose();
});

test("webhook route unregisters on plugin unload (lifecycle rule)", async () => {
  const { handlers, fiber } = await setup();
  expect(handlers.has(WEBHOOK_PATH)).toBe(true);

  await fiber.dispose();

  expect(handlers.has(WEBHOOK_PATH)).toBe(false);
});
