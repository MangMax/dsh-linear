/**
 * Agent webhook route tests (plan §39, §40; Milestone 8).
 *
 * Uses the REAL `LinearWebhookClient` signature verification through our
 * route handler: HMAC-SHA256 signature + 60-second timestamp window, the
 * 5-second-response fire-and-forget dispatch to the bridge, and the
 * degradation paths (no secret → 503, no bridge → 503, bad signature → 400).
 */
import { expect, test, vi } from "vite-plus/test";
import { createHmac } from "node:crypto";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { SecretStore } from "../../src/harness/credentials.ts";
import type { AgentSessionEventLike, LinearAgentBridge } from "../../src/agent/bridge.ts";
import {
  AGENT_SESSION_EVENT_TYPE,
  WEBHOOK_SECRET_REF,
  createAgentWebhookRoute,
} from "../../src/agent/webhook.ts";

const SECRET = "webhook-secret-123";

function sign(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** Build a valid AgentSessionEvent payload for action `action`. */
function eventPayload(action: string, overrides: Record<string, unknown> = {}) {
  return {
    type: AGENT_SESSION_EVENT_TYPE,
    webhookTimestamp: Date.now(),
    webhookId: "wh-1",
    organizationId: "org-1",
    oauthClientId: "client-1",
    appUserId: "app-user-1",
    action,
    createdAt: new Date().toISOString(),
    agentSession: { id: "lin-session-1", issue: { id: "issue-1", identifier: "ENG-1" } },
    promptContext: "Fix this issue",
    ...overrides,
  };
}

function fakeReq(body: string, headers: Record<string, string>): IncomingMessage {
  // The SDK's Node adapter consumes the request as a body stream.
  const stream = Readable.from([Buffer.from(body)]);
  return Object.assign(stream, {
    url: "/integrations/linear/webhook",
    method: "POST",
    headers,
  }) as unknown as IncomingMessage;
}

function fakeRes(): ServerResponse & { body(): string; headers: Record<string, string> } {
  const chunks: string[] = [];
  const headers: Record<string, string> = {};
  return {
    statusCode: 0,
    headers,
    setHeader(key: string, value: string) {
      headers[key] = value;
    },
    end(payload?: unknown) {
      if (typeof payload === "string") chunks.push(payload);
    },
    body() {
      return chunks.join("");
    },
  } as unknown as ServerResponse & { body(): string; headers: Record<string, string> };
}

function fakeSecretStore(secret: string | undefined) {
  const store: SecretStore = {
    get: vi.fn(async () => secret),
    set: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  };
  return store;
}

function fakeBridge() {
  const handleAgentSessionEvent = vi.fn(async (_event: AgentSessionEventLike) => {});
  const bridge = { handleAgentSessionEvent } as unknown as LinearAgentBridge;
  return { bridge, handleAgentSessionEvent };
}

function silentLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

test("verified created event reaches the bridge and answers 200 quickly", async () => {
  const body = JSON.stringify(eventPayload("created"));
  const { bridge, handleAgentSessionEvent } = fakeBridge();
  const route = createAgentWebhookRoute({
    secretStore: fakeSecretStore(SECRET),
    webhookSecretRef: WEBHOOK_SECRET_REF,
    bridge,
    logger: silentLogger(),
  });
  const res = fakeRes();

  await route(
    fakeReq(body, { "linear-signature": sign(body), "content-type": "application/json" }),
    res,
  );

  expect(res.statusCode).toBe(200);
  expect(handleAgentSessionEvent).toHaveBeenCalledTimes(1);
  const event = handleAgentSessionEvent.mock.calls[0]?.[0];
  expect(event?.action).toBe("created");
  expect(event?.agentSession.id).toBe("lin-session-1");
  expect(event?.promptContext).toBe("Fix this issue");
});

test("prompted event carries agentActivity.body to the bridge", async () => {
  const body = JSON.stringify(
    eventPayload("prompted", {
      promptContext: null,
      agentActivity: { id: "act-1", body: "请继续修改" },
    }),
  );
  const { bridge, handleAgentSessionEvent } = fakeBridge();
  const route = createAgentWebhookRoute({
    secretStore: fakeSecretStore(SECRET),
    webhookSecretRef: WEBHOOK_SECRET_REF,
    bridge,
    logger: silentLogger(),
  });
  const res = fakeRes();

  await route(
    fakeReq(body, { "linear-signature": sign(body), "content-type": "application/json" }),
    res,
  );

  expect(res.statusCode).toBe(200);
  expect(handleAgentSessionEvent.mock.calls[0]?.[0]?.agentActivity?.body).toBe("请继续修改");
});

test("bad signature is rejected with 400 and the bridge is untouched", async () => {
  const body = JSON.stringify(eventPayload("created"));
  const { bridge, handleAgentSessionEvent } = fakeBridge();
  const route = createAgentWebhookRoute({
    secretStore: fakeSecretStore(SECRET),
    webhookSecretRef: WEBHOOK_SECRET_REF,
    bridge,
    logger: silentLogger(),
  });
  const res = fakeRes();

  await route(fakeReq(body, { "linear-signature": "deadbeef" }), res);

  expect(res.statusCode).toBe(400);
  expect(handleAgentSessionEvent).not.toHaveBeenCalled();
});

test("missing signature header is rejected with 400", async () => {
  const body = JSON.stringify(eventPayload("created"));
  const { bridge } = fakeBridge();
  const route = createAgentWebhookRoute({
    secretStore: fakeSecretStore(SECRET),
    webhookSecretRef: WEBHOOK_SECRET_REF,
    bridge,
    logger: silentLogger(),
  });
  const res = fakeRes();

  await route(fakeReq(body, {}), res);

  expect(res.statusCode).toBe(400);
});

test("stale timestamp beyond the 60 s window is rejected", async () => {
  const body = JSON.stringify(
    eventPayload("created", { webhookTimestamp: Date.now() - 2 * 60 * 1000 }),
  );
  const { bridge } = fakeBridge();
  const route = createAgentWebhookRoute({
    secretStore: fakeSecretStore(SECRET),
    webhookSecretRef: WEBHOOK_SECRET_REF,
    bridge,
    logger: silentLogger(),
  });
  const res = fakeRes();

  await route(
    fakeReq(body, { "linear-signature": sign(body), "content-type": "application/json" }),
    res,
  );

  expect(res.statusCode).toBe(400);
});

test("no configured secret answers 503 and never touches the bridge", async () => {
  const body = JSON.stringify(eventPayload("created"));
  const { bridge, handleAgentSessionEvent } = fakeBridge();
  const logger = silentLogger();
  const route = createAgentWebhookRoute({
    secretStore: fakeSecretStore(undefined),
    webhookSecretRef: WEBHOOK_SECRET_REF,
    bridge,
    logger,
  });
  const res = fakeRes();

  await route(fakeReq(body, { "linear-signature": sign(body) }), res);

  expect(res.statusCode).toBe(503);
  expect(handleAgentSessionEvent).not.toHaveBeenCalled();
  expect(JSON.parse(res.body()).error).toBe("linear_webhook");
});

test("bridge missing (agent mode inactive) answers 503", async () => {
  const body = JSON.stringify(eventPayload("created"));
  const route = createAgentWebhookRoute({
    secretStore: fakeSecretStore(SECRET),
    webhookSecretRef: WEBHOOK_SECRET_REF,
    bridge: undefined,
    logger: silentLogger(),
  });
  const res = fakeRes();

  await route(fakeReq(body, { "linear-signature": sign(body) }), res);

  expect(res.statusCode).toBe(503);
});

test("non-POST methods are rejected", async () => {
  const route = createAgentWebhookRoute({
    secretStore: fakeSecretStore(SECRET),
    webhookSecretRef: WEBHOOK_SECRET_REF,
    bridge: fakeBridge().bridge,
    logger: silentLogger(),
  });
  const res = fakeRes();
  const req = {
    url: "/integrations/linear/webhook",
    method: "GET",
    headers: {},
  } as unknown as IncomingMessage;

  await route(req, res);

  expect(res.statusCode).toBe(405);
});
