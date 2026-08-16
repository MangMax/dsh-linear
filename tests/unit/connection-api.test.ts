/**
 * Browser connection API tests (plan §50 — Milestone 7 网页授权).
 *
 * The same-origin JSON routes drive the Settings card: status never throws,
 * connect/reconnect/disconnect normalize failures to `{ error, message }`,
 * methods are enforced, and nothing sensitive ever leaves the host.
 */
import { expect, test } from "vite-plus/test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { registerConnectionApi, LINEAR_API_PREFIX } from "../../src/harness/connection-api.ts";
import type { WebRouteRegistrar } from "../../src/harness/web.ts";
import { LinearConnectorError } from "../../src/linear/error.ts";
import type { ConnectionStatus } from "../../src/model/connection.ts";
import type {
  LinearConnectResult,
  LinearConnectionServiceLike,
} from "../../src/linear/services/connection-service.ts";

interface FakeResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

function fakeRes(): FakeResponse {
  const captured: FakeResponse = { statusCode: 0, headers: {}, body: "" };
  const res = {
    get statusCode() {
      return captured.statusCode;
    },
    set statusCode(value: number) {
      captured.statusCode = value;
    },
    get headers() {
      return captured.headers;
    },
    get body() {
      return captured.body;
    },
    setHeader(name: string, value: string) {
      captured.headers[name] = value;
    },
    end(text: string) {
      captured.body = text;
    },
  };
  return res as unknown as FakeResponse;
}

function fakeService(
  overrides: Partial<LinearConnectionServiceLike> = {},
): LinearConnectionServiceLike {
  const base: LinearConnectionServiceLike = {
    mode: "oauth",
    getState: () => "disconnected",
    getConnectionStatus: async (): Promise<ConnectionStatus> => ({
      connected: false,
      authMode: "oauth",
      state: "disconnected",
    }),
    getStatus: async (): Promise<ConnectionStatus> => ({
      connected: false,
      authMode: "oauth",
      state: "disconnected",
    }),
    connect: async (): Promise<LinearConnectResult> => ({
      kind: "authorize",
      url: "https://linear.app/oauth/authorize?x=1",
      state: "s" as never,
    }),
    disconnect: async () => {},
    reconnect: async (): Promise<LinearConnectResult> => ({
      kind: "authorize",
      url: "https://linear.app/oauth/authorize?x=2",
      state: "s" as never,
    }),
  };
  return { ...base, ...overrides };
}

function fakeSettings(overrides: Record<string, unknown> = {}) {
  const descriptors = [
    {
      ns: "linear",
      value: { authMode: "oauth", oauthClientId: "cid", redirectUri: "http://127.0.0.1:3080/cb" },
      base: {},
      user: {},
      applies: "restart",
      secrets: [{ path: ["oauthClientSecret"], set: true }],
    },
  ];
  const mutate = overrides.mutate ?? (async () => {});
  return {
    writable: true,
    describe: (options?: { redactSecrets?: boolean }) =>
      options?.redactSecrets === true
        ? descriptors.map((descriptor) => ({
            ...descriptor,
            secrets: [{ path: ["oauthClientSecret"], set: true }],
          }))
        : descriptors,
    update: async () => {},
    mutate,
  } as never;
}

function capture(
  service: LinearConnectionServiceLike,
  method: string,
  path: string,
  settings?: unknown,
) {
  const handlers = new Map<
    string,
    (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
  >();
  const registrar: WebRouteRegistrar = {
    registerCallback: (route, handler) => {
      handlers.set(route, handler);
      return () => {};
    },
  };
  registerConnectionApi(registrar, service, { oauthConfigured: true }, settings as never);
  const route = `${LINEAR_API_PREFIX}${path}`;
  const handler = handlers.get(route);
  expect(handler, `route ${route} registered`).toBeDefined();
  return async (reqMethod = method, body?: string) => {
    const res = fakeRes();
    const req = {
      method: reqMethod,
      on(event: string, callback: (chunk?: Buffer) => void) {
        if (event === "data" && body !== undefined) callback(Buffer.from(body));
        if (event === "end") queueMicrotask(() => callback());
        return req;
      },
    };
    await handler!(req as IncomingMessage, res as never);
    return {
      ...res,
      body: res.body ? (JSON.parse(res.body) as Record<string, unknown>) : undefined,
    };
  };
}

test("status GET returns the connection status as JSON", async () => {
  const run = capture(
    fakeService({
      getStatus: async () => ({
        connected: true,
        authMode: "oauth",
        state: "connected",
        workspace: { id: "w1", name: "Acme" },
        viewer: { id: "u1", name: "Ada" },
      }),
    }),
    "GET",
    "/status",
  );
  const result = await run();
  expect(result.statusCode).toBe(200);
  expect(result.headers["content-type"]).toContain("application/json");
  expect(result.headers["cache-control"]).toBe("no-store");
  expect(result.body).toMatchObject({
    connected: true,
    workspace: { name: "Acme" },
    ui: { oauthConfigured: true },
  });
});

test("non-GET status is rejected with 405", async () => {
  const run = capture(fakeService(), "GET", "/status");
  const result = await run("POST");
  expect(result.statusCode).toBe(405);
  expect(result.body).toMatchObject({ error: "METHOD_NOT_ALLOWED" });
});

test("connect POST returns the OAuth authorize URL", async () => {
  const run = capture(fakeService(), "POST", "/connect");
  const result = await run();
  expect(result.statusCode).toBe(200);
  expect(result.body).toMatchObject({
    kind: "authorize",
    url: "https://linear.app/oauth/authorize?x=1",
  });
});

test("connect failure normalizes to a clean error body", async () => {
  const run = capture(
    fakeService({
      connect: async () => {
        throw LinearConnectorError.validation("The OAuth flow is not configured.");
      },
    }),
    "POST",
    "/connect",
  );
  const result = await run();
  expect(result.statusCode).toBe(400);
  expect(result.body).toEqual({
    error: "VALIDATION_ERROR",
    message: "The OAuth flow is not configured.",
  });
});

test("unexpected connect failure becomes INTERNAL without leaking the stack", async () => {
  const run = capture(
    fakeService({
      connect: async () => {
        throw new Error("GraphQL request failed at ...\n    at <anonymous>");
      },
    }),
    "POST",
    "/connect",
  );
  const result = await run();
  expect(result.statusCode).toBe(400);
  expect(result.body).toMatchObject({ error: "INTERNAL" });
  expect(String(result.body?.message)).not.toContain("at <anonymous>");
});

test("disconnect POST confirms and reconnect returns its result", async () => {
  const disconnect = capture(fakeService(), "POST", "/disconnect");
  expect((await disconnect()).body).toEqual({ ok: true });

  const reconnect = capture(
    fakeService({
      reconnect: async () => ({
        kind: "connected",
        status: { connected: true, authMode: "oauth", state: "connected" },
      }),
    }),
    "POST",
    "/reconnect",
  );
  const result = await reconnect();
  expect(result.statusCode).toBe(200);
  expect(result.body).toMatchObject({ kind: "connected" });
});

test("settings GET returns the redacted namespace view", async () => {
  const run = capture(fakeService(), "GET", "/settings", fakeSettings());
  const result = await run();
  expect(result.statusCode).toBe(200);
  expect(result.body).toMatchObject({
    ns: "linear",
    applies: "restart",
    writable: true,
    value: { authMode: "oauth", oauthClientId: "cid" },
    secrets: [{ path: ["oauthClientSecret"], set: true }],
  });
  // The client secret never leaves the host — even redacted views carry no value.
  expect(JSON.stringify(result.body)).not.toContain('oauthClientSecret": "');
});

test("settings GET without the settings service answers 503", async () => {
  const run = capture(fakeService(), "GET", "/settings");
  const result = await run();
  expect(result.statusCode).toBe(503);
  expect(result.body).toMatchObject({ error: "SETTINGS_UNAVAILABLE" });
});

test("settings POST writes whitelisted ops through mutate", async () => {
  const written: Array<{ op: string; path: string[]; value?: unknown }> = [];
  const run = capture(
    fakeService(),
    "POST",
    "/settings",
    fakeSettings({
      mutate: async (_ns: string, ops: Array<{ op: string; path: string[]; value?: unknown }>) => {
        written.push(...ops);
      },
    }),
  );
  const result = await run(
    "POST",
    JSON.stringify({
      ops: [
        { op: "set", path: ["authMode"], value: "apiKey" },
        { op: "unset", path: ["oauthClientId"] },
      ],
    }),
  );
  expect(result.statusCode).toBe(200);
  expect(result.body).toEqual({ ok: true });
  expect(written).toEqual([
    { op: "set", path: ["authMode"], value: "apiKey" },
    { op: "unset", path: ["oauthClientId"] },
  ]);
});

test("settings POST rejects fields outside the browser allowlist", async () => {
  const run = capture(fakeService(), "POST", "/settings", fakeSettings());
  const result = await run(
    "POST",
    JSON.stringify({ ops: [{ op: "set", path: ["defaultTeam"], value: "Engineering" }] }),
  );
  expect(result.statusCode).toBe(400);
  expect(result.body).toMatchObject({ error: "VALIDATION_ERROR" });
});

test("settings POST allows live-switchable fields including writePolicy", async () => {
  const written: Array<{ op: string; path: string[]; value?: unknown }> = [];
  const run = capture(
    fakeService(),
    "POST",
    "/settings",
    fakeSettings({
      mutate: async (_ns: string, ops: Array<{ op: string; path: string[]; value?: unknown }>) => {
        written.push(...ops);
      },
    }),
  );
  const result = await run(
    "POST",
    JSON.stringify({ ops: [{ op: "set", path: ["writePolicy"], value: "ask" }] }),
  );
  expect(result.statusCode).toBe(200);
  expect(written).toEqual([{ op: "set", path: ["writePolicy"], value: "ask" }]);
});

test("settings POST rejects malformed ops", async () => {
  const run = capture(fakeService(), "POST", "/settings", fakeSettings());
  const result = await run("POST", JSON.stringify({ ops: [{ op: "delete", path: ["authMode"] }] }));
  expect(result.statusCode).toBe(400);
  expect(result.body).toMatchObject({ error: "VALIDATION_ERROR" });
});
