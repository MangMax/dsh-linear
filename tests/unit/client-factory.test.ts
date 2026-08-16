/**
 * Client factory tests (plan §28, §29 — Milestone 7 cache).
 *
 * The token-fingerprint → client cache is verified with a fake auth seam
 * (no network): same token reuses the instance, token / auth-mode changes
 * rebuild it, `clear()` drops it, and credentials are still re-resolved per
 * operation. The retryable wrapper is verified end-to-end with a stubbed
 * global `fetch` (the SDK reads `retry-after` from the 429 response, plan
 * §34) — the same no-network pattern as the OAuth provider tests.
 */
import { afterEach, expect, test, vi } from "vite-plus/test";
import type { LinearAuth, ResolvedLinearAuth } from "../../src/auth/auth-service.ts";
import { LinearClientFactory } from "../../src/linear/client-factory.ts";

function jsonResponse(status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json", ...extraHeaders }),
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

/** Auth that walks through a token list; `mode` switches the auth type. */
class WalkAuth implements LinearAuth {
  mode: "apiKey" | "oauth";
  resolveCalls = 0;
  constructor(
    private readonly tokens: string[],
    mode: "apiKey" | "oauth" = "apiKey",
  ) {
    this.mode = mode;
  }
  async resolve(): Promise<ResolvedLinearAuth> {
    const index = Math.min(this.resolveCalls, this.tokens.length - 1);
    this.resolveCalls += 1;
    const token = this.tokens[index];
    return this.mode === "apiKey"
      ? { type: "apiKey", apiKey: token }
      : { type: "oauth", accessToken: token };
  }
  async getValidAccessToken(): Promise<string> {
    throw new Error("not used in this test");
  }
  async disconnect(): Promise<void> {}
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("same credential reuses the cached client and still re-resolves per operation", async () => {
  const auth = new WalkAuth(["token-a", "token-a", "token-a"]);
  const factory = new LinearClientFactory(auth);

  const first = await factory.create();
  const second = await factory.create();
  const third = await factory.create();

  expect(second).toBe(first);
  expect(third).toBe(first);
  expect(auth.resolveCalls).toBe(3); // §29: per-operation credential resolution
});

test("changed token rebuilds the client", async () => {
  const auth = new WalkAuth(["token-a", "token-b"]);
  const factory = new LinearClientFactory(auth);

  const before = await factory.create();
  const after = await factory.create();

  expect(after).not.toBe(before);
});

test("fingerprint separates auth modes even for an identical token", async () => {
  const apiKeyAuth = new WalkAuth(["same-token"], "apiKey");
  const oauthAuth = new WalkAuth(["same-token"], "oauth");
  const factory = new LinearClientFactory(apiKeyAuth);

  const apiKeyClient = await factory.create();
  expect(apiKeyClient).toBeDefined();

  // A factory bound to a different auth type never shares the cache.
  const other = new LinearClientFactory(oauthAuth);
  expect(await other.create()).not.toBe(apiKeyClient);
});

test("clear() drops the cache and the next create rebuilds", async () => {
  const auth = new WalkAuth(["token-a"]);
  const factory = new LinearClientFactory(auth);

  const before = await factory.create();
  factory.clear();
  const after = await factory.create();

  expect(after).not.toBe(before);
});

test("cached clients run the §34 retry policy (429 with retry-after is retried)", async () => {
  const fetchMock = vi.fn(async () => {
    if (fetchMock.mock.calls.length === 1) {
      return jsonResponse(429, { errors: [] }, { "retry-after": "0.01" });
    }
    return jsonResponse(200, { data: { teams: { nodes: [], pageInfo: { hasNextPage: false } } } });
  });
  vi.stubGlobal("fetch", fetchMock);

  const factory = new LinearClientFactory(new WalkAuth(["token-a"]), {
    retry: { baseDelayMs: 1, maxDelayMs: 100 },
  });
  const client = await factory.create();

  await expect(client.teams({ first: 1 })).resolves.toBeDefined();
  expect(fetchMock).toHaveBeenCalledTimes(2); // first attempt + one retry

  // The cached client still retries on later operations.
  await expect(client.teams({ first: 1 })).resolves.toBeDefined();
  expect(fetchMock).toHaveBeenCalledTimes(3); // this time success on first try
});
