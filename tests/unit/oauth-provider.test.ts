/**
 * OAuth provider protocol tests (plan §55 automatic coverage).
 *
 * The REAL `oauth4webapi` protocol layer runs against a stubbed global
 * `fetch` (no network): PKCE challenge generation, authorization-response
 * validation, token-exchange / refresh request bodies and response parsing
 * are all exercised for real. Covered cases (§55):
 *   state mismatch · missing code · exchange success · exchange error ·
 *   refresh rotation · revoked token · credential (bundle) update.
 */
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import {
  DEFAULT_OAUTH_SCOPE,
  LINEAR_AUTHORIZE_ENDPOINT,
  LINEAR_REVOKE_ENDPOINT,
  LINEAR_TOKEN_ENDPOINT,
  OAUTH_REFRESH_THRESHOLD_MS,
  LinearOAuthProvider,
  type OAuthProviderOptions,
} from "../../src/auth/oauth-provider.ts";
import { InMemoryOAuthStateStore } from "../../src/auth/oauth-state.ts";
import { TokenStore, type LinearOAuthTokenBundle } from "../../src/auth/token-store.ts";
import type { SecretStore } from "../../src/harness/credentials.ts";

const NOW = 1_800_000_000_000;
const REF = "DSH_LINEAR_OAUTH";
const REDIRECT_URI = "http://127.0.0.1:8765/integrations/linear/oauth/callback";

function fakeSecretStore(): SecretStore & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    async get(ref) {
      return values.get(ref);
    },
    async set(ref, value) {
      values.set(ref, value);
    },
    async delete(ref) {
      values.delete(ref);
    },
  };
}

function baseOptions(): OAuthProviderOptions {
  return {
    clientId: "linear-client-1",
    redirectUri: REDIRECT_URI,
    actorMode: "user",
    scope: [...DEFAULT_OAUTH_SCOPE],
  };
}

function makeProvider(overrides: Partial<OAuthProviderOptions> = {}) {
  const store = fakeSecretStore();
  const tokens = new TokenStore(store, REF);
  const states = new InMemoryOAuthStateStore();
  const provider = new LinearOAuthProvider(
    { ...baseOptions(), ...overrides },
    tokens,
    states,
    () => NOW,
  );
  return { provider, tokens, states, store };
}

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function tokenBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    access_token: "access-1",
    refresh_token: "refresh-1",
    expires_in: 86399,
    scope: "read write",
    token_type: "Bearer",
    ...overrides,
  };
}

function storedBundle(overrides: Partial<LinearOAuthTokenBundle> = {}): LinearOAuthTokenBundle {
  return {
    accessToken: "access-old",
    refreshToken: "refresh-old",
    expiresAt: NOW + 3600_000,
    scope: ["read", "write"],
    tokenType: "bearer",
    actorMode: "user",
    ...overrides,
  };
}

type FetchHandler = (url: string, init: RequestInit) => Response | Promise<Response>;

function installFetch(handler: FetchHandler) {
  const fetchMock = vi.fn(handler);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("beginAuthorization", () => {
  test("builds the Linear authorize URL with PKCE S256, state and minimal scope", async () => {
    const { provider, states } = makeProvider();
    const result = await provider.beginAuthorization();

    const url = new URL(result.url);
    expect(url.origin + url.pathname).toBe(LINEAR_AUTHORIZE_ENDPOINT);
    const q = url.searchParams;
    expect(q.get("client_id")).toBe("linear-client-1");
    expect(q.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(q.get("response_type")).toBe("code");
    expect(q.get("scope")).toBe("read,write");
    expect(q.get("actor")).toBe("user");
    expect(q.get("prompt")).toBe("consent");
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("code_challenge")).toMatch(/^[A-Za-z0-9\-_]{43}$/);
    expect(q.get("state")).toBe(result.state.state);
    expect(result.state.codeVerifier).toMatch(/^[A-Za-z0-9\-_]{43,128}$/);

    // The pending state (state + verifier + redirectUri) is stored for the
    // callback (plan §19).
    const pending = states.take(result.state.state);
    expect(pending?.codeVerifier).toBe(result.state.codeVerifier);
    expect(pending?.redirectUri).toBe(REDIRECT_URI);
    expect(pending?.createdAt).toBe(NOW);
  });

  test("honors actorMode instead of hardcoding actor=user (plan §24)", async () => {
    const { provider } = makeProvider({ actorMode: "app" });
    const result = await provider.beginAuthorization();
    expect(new URL(result.url).searchParams.get("actor")).toBe("app");
  });
});

describe("handleCallback", () => {
  test("rejects an unknown / forged state (state mismatch, plan §19)", async () => {
    const { provider } = makeProvider();
    await expect(provider.handleCallback({ code: "c", state: "forged" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  test("rejects an expired pending state", async () => {
    const { provider, states } = makeProvider();
    states.put({
      state: "stale",
      codeVerifier: "v",
      redirectUri: REDIRECT_URI,
      // The store TTLs against the real clock (Date.now), not the injected
      // provider clock — use a genuinely stale timestamp.
      createdAt: Date.now() - 10 * 60 * 1000 - 1,
    });
    await expect(provider.handleCallback({ code: "c", state: "stale" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  test("rejects a callback without a code (missing code, plan §55)", async () => {
    const fetchMock = installFetch(() => jsonResponse(200, tokenBody()));
    const { provider } = makeProvider();
    const begin = await provider.beginAuthorization();
    await expect(provider.handleCallback({ state: begin.state.state })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("maps a denied authorization to PERMISSION_DENIED without any exchange", async () => {
    const fetchMock = installFetch(() => jsonResponse(200, tokenBody()));
    const { provider } = makeProvider();
    const begin = await provider.beginAuthorization();
    await expect(
      provider.handleCallback({
        state: begin.state.state,
        error: "access_denied",
        errorDescription: "User rejected the request",
      }),
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      message: expect.stringContaining("User rejected the request"),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("exchanges the code with PKCE verifier and persists one bundle secret", async () => {
    const { provider, store } = makeProvider();
    const begin = await provider.beginAuthorization();
    const codeVerifier = begin.state.codeVerifier;

    const fetchMock = installFetch(async (url, init) => {
      expect(String(url)).toBe(LINEAR_TOKEN_ENDPOINT);
      expect(init.method).toBe("POST");
      const body = new URLSearchParams(init.body as URLSearchParams);
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("code")).toBe("the-code");
      expect(body.get("code_verifier")).toBe(codeVerifier);
      expect(body.get("client_id")).toBe("linear-client-1");
      expect(body.get("client_secret")).toBeNull();
      return jsonResponse(200, tokenBody());
    });

    const bundle = await provider.handleCallback({ code: "the-code", state: begin.state.state });

    expect(bundle.accessToken).toBe("access-1");
    expect(bundle.refreshToken).toBe("refresh-1");
    expect(bundle.expiresAt).toBe(NOW + 86399 * 1000);
    expect(bundle.scope).toEqual(["read", "write"]);
    expect(bundle.tokenType).toBe("bearer");
    expect(bundle.actorMode).toBe("user");

    // Atomic single-secret persist (plan §20) — credential update via one write.
    expect(store.values.size).toBe(1);
    const persisted = JSON.parse(store.values.get(REF)!) as LinearOAuthTokenBundle;
    expect(persisted.accessToken).toBe("access-1");
    expect(persisted.refreshToken).toBe("refresh-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("includes client_secret when configured (confidential client)", async () => {
    installFetch(async (_url, init) => {
      const body = new URLSearchParams(init.body as URLSearchParams);
      expect(body.get("client_secret")).toBe("s3cret");
      return jsonResponse(200, tokenBody());
    });
    const { provider } = makeProvider({ clientSecret: "s3cret" });
    const begin = await provider.beginAuthorization();
    await provider.handleCallback({ code: "c", state: begin.state.state });
  });

  test("maps a token exchange error to AUTH_EXPIRED and writes nothing", async () => {
    installFetch(() =>
      jsonResponse(400, {
        error: "invalid_grant",
        error_description: "The authorization code is invalid or expired",
      }),
    );
    const { provider, store } = makeProvider();
    const begin = await provider.beginAuthorization();
    await expect(
      provider.handleCallback({ code: "bad", state: begin.state.state }),
    ).rejects.toMatchObject({
      code: "AUTH_EXPIRED",
      message: expect.stringContaining("invalid or expired"),
    });
    expect(store.values.size).toBe(0);
  });

  test("consumes the state exactly once", async () => {
    installFetch(() => jsonResponse(200, tokenBody()));
    const { provider } = makeProvider();
    const begin = await provider.beginAuthorization();
    await provider.handleCallback({ code: "c", state: begin.state.state });
    await expect(
      provider.handleCallback({ code: "c2", state: begin.state.state }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("getValidAccessToken", () => {
  test("reports NOT_CONNECTED when no bundle is stored", async () => {
    const fetchMock = installFetch(() => jsonResponse(200, tokenBody()));
    const { provider } = makeProvider();
    await expect(provider.getValidAccessToken()).rejects.toMatchObject({
      code: "NOT_CONNECTED",
      message: expect.stringContaining("Connect"),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("returns the stored token without refreshing while it is fresh", async () => {
    const fetchMock = installFetch(() => jsonResponse(200, tokenBody()));
    const { provider, tokens } = makeProvider();
    await tokens.write(storedBundle());
    await expect(provider.getValidAccessToken()).resolves.toBe("access-old");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("refreshes proactively when within the 5-minute threshold (plan §21)", async () => {
    const fetchMock = installFetch(async (_url, init) => {
      const body = new URLSearchParams(init.body as URLSearchParams);
      expect(body.get("grant_type")).toBe("refresh_token");
      expect(body.get("refresh_token")).toBe("refresh-old");
      expect(body.get("client_id")).toBe("linear-client-1");
      return jsonResponse(
        200,
        tokenBody({ access_token: "access-new", refresh_token: "refresh-new" }),
      );
    });
    const { provider, tokens } = makeProvider();
    await tokens.write(storedBundle({ expiresAt: NOW + OAUTH_REFRESH_THRESHOLD_MS }));

    await expect(provider.getValidAccessToken()).resolves.toBe("access-new");

    // The bundle is replaced whole — one secret, both new tokens (plan §20).
    const persisted = await tokens.read();
    expect(persisted?.accessToken).toBe("access-new");
    expect(persisted?.refreshToken).toBe("refresh-new");
    expect(persisted?.expiresAt).toBe(NOW + 86399 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("keeps the old refresh token when the refresh response omits one (rotation, §21)", async () => {
    installFetch(() =>
      jsonResponse(200, tokenBody({ access_token: "access-new", refresh_token: undefined })),
    );
    const { provider, tokens } = makeProvider();
    await tokens.write(storedBundle({ expiresAt: NOW + 1000 }));

    await expect(provider.getValidAccessToken()).resolves.toBe("access-new");
    const persisted = await tokens.read();
    expect(persisted?.refreshToken).toBe("refresh-old");
  });

  test("concurrent near-expiry calls perform exactly one refresh (single-flight, §22)", async () => {
    let calls = 0;
    installFetch(async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return jsonResponse(200, tokenBody({ access_token: "access-new" }));
    });
    const { provider, tokens } = makeProvider();
    await tokens.write(storedBundle({ expiresAt: NOW + 1000 }));

    const results = await Promise.all([
      provider.getValidAccessToken(),
      provider.getValidAccessToken(),
      provider.getValidAccessToken(),
    ]);
    expect(results).toEqual(["access-new", "access-new", "access-new"]);
    expect(calls).toBe(1);
    expect((await tokens.read())?.accessToken).toBe("access-new");
  });

  test("maps a revoked refresh token (invalid_grant) to AUTH_EXPIRED", async () => {
    installFetch(() =>
      jsonResponse(400, {
        error: "invalid_grant",
        error_description: "The refresh token is invalid",
      }),
    );
    const { provider, tokens } = makeProvider();
    await tokens.write(storedBundle({ expiresAt: NOW + 1000 }));
    await expect(provider.getValidAccessToken()).rejects.toMatchObject({
      code: "AUTH_EXPIRED",
    });
  });

  test("maps a 401 WWW-Authenticate challenge (revoked access token) to AUTH_EXPIRED", async () => {
    installFetch(() =>
      jsonResponse(
        401,
        { error: "invalid_token" },
        { "www-authenticate": 'Bearer error="invalid_token"' },
      ),
    );
    const { provider, tokens } = makeProvider();
    await tokens.write(storedBundle({ expiresAt: NOW + 1000 }));
    await expect(provider.getValidAccessToken()).rejects.toMatchObject({
      code: "AUTH_EXPIRED",
    });
  });

  test("maps network failures to NETWORK_ERROR", async () => {
    installFetch(() => {
      throw new TypeError("fetch failed");
    });
    const { provider, tokens } = makeProvider();
    await tokens.write(storedBundle({ expiresAt: NOW + 1000 }));
    await expect(provider.getValidAccessToken()).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
  });
});

describe("resolve", () => {
  test("resolves to an oauth access token through the same refresh path", async () => {
    const { provider, tokens } = makeProvider();
    await tokens.write(storedBundle());
    await expect(provider.resolve()).resolves.toEqual({
      type: "oauth",
      accessToken: "access-old",
    });
  });
});

describe("revoke / disconnect", () => {
  test("revokes the access token at Linear and deletes the credential", async () => {
    const fetchMock = installFetch(async (url, init) => {
      expect(String(url)).toBe(LINEAR_REVOKE_ENDPOINT);
      const body = new URLSearchParams(init.body as URLSearchParams);
      expect(body.get("token")).toBe("access-old");
      expect(body.get("client_id")).toBe("linear-client-1");
      return new Response(null, { status: 200 });
    });
    const { provider, tokens } = makeProvider();
    await tokens.write(storedBundle());

    await provider.revoke();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(tokens.read()).resolves.toBeUndefined();
  });

  test("revoke is best-effort: a failing revocation still cleans up locally", async () => {
    installFetch(() => {
      throw new TypeError("network down");
    });
    const { provider, tokens } = makeProvider();
    await tokens.write(storedBundle());

    await expect(provider.revoke()).resolves.toBeUndefined();
    await expect(tokens.read()).resolves.toBeUndefined();
  });

  test("revoke with no stored bundle performs no network call", async () => {
    const fetchMock = installFetch(() => jsonResponse(200, tokenBody()));
    const { provider } = makeProvider();
    await expect(provider.revoke()).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("disconnect delegates to revoke (plan §51)", async () => {
    const fetchMock = installFetch(() => new Response(null, { status: 200 }));
    const { provider, tokens } = makeProvider();
    await tokens.write(storedBundle());

    await provider.disconnect();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(tokens.read()).resolves.toBeUndefined();
  });
});
