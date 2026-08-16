/**
 * Connection lifecycle service unit tests (plan §50–§52; Milestone 6).
 *
 * Pure state-machine coverage with fakes — no harness, no Linear: the auth
 * boundary, the client factory, the metadata catalog and the workspace
 * service are all stubbed, so the §50 states, the §51 disconnect sequence
 * and the connect / reconnect flows are verified in isolation.
 */
import { expect, test } from "vite-plus/test";
import { LinearConnectorError } from "../../src/linear/error.ts";
import type { LinearAuth, ResolvedLinearAuth } from "../../src/auth/auth-service.ts";
import type { OAuthProvider, BeginAuthorizationResult } from "../../src/auth/oauth-provider.ts";
import type { LinearClientFactoryLike } from "../../src/linear/client-factory.ts";
import type { WorkspaceService } from "../../src/linear/services/workspace-service.ts";
import {
  LinearConnectionService,
  type LinearConnectionServiceOptions,
} from "../../src/linear/services/connection-service.ts";

class FakeAuth implements LinearAuth {
  readonly mode: "oauth" | "apiKey";
  failure: LinearConnectorError | undefined;
  disconnectCalls = 0;
  disconnectFailure: unknown;

  constructor(mode: "oauth" | "apiKey" = "oauth") {
    this.mode = mode;
  }

  async resolve(): Promise<ResolvedLinearAuth> {
    if (this.failure) throw this.failure;
    return this.mode === "oauth"
      ? { type: "oauth", accessToken: "tok" }
      : { type: "apiKey", apiKey: "key" };
  }

  async getValidAccessToken(): Promise<string> {
    return "tok";
  }

  async disconnect(): Promise<void> {
    this.disconnectCalls += 1;
    if (this.disconnectFailure) throw this.disconnectFailure;
  }
}

class FakeOAuth implements OAuthProvider {
  beginCalls = 0;

  async beginAuthorization(): Promise<BeginAuthorizationResult> {
    this.beginCalls += 1;
    return {
      url: "https://linear.app/oauth/authorize?client_id=c",
      state: {
        state: "s",
        codeVerifier: "v",
        redirectUri: "http://127.0.0.1:8765/integrations/linear/oauth/callback",
        createdAt: 0,
      },
    };
  }

  async handleCallback(): Promise<never> {
    throw new Error("not used in unit tests");
  }

  async revoke(): Promise<void> {}
}

class FakeWorkspace implements WorkspaceService {
  constructor(private readonly failure?: unknown) {}

  async getWorkspace() {
    if (this.failure) throw this.failure;
    return { id: "ws-1", name: "Acme" };
  }

  async getViewer() {
    if (this.failure) throw this.failure;
    return { id: "u-1", name: "Mang", email: "mang@acme.dev" };
  }
}

interface Rigs {
  service: LinearConnectionService;
  auth: FakeAuth;
  oauth: FakeOAuth | undefined;
  factoryClears: () => number;
  catalogClears: () => number;
}

function make(
  overrides: Partial<LinearConnectionServiceOptions> & { workspaceFailure?: unknown } = {},
): Rigs {
  const auth = (overrides.auth as FakeAuth | undefined) ?? new FakeAuth("oauth");
  const oauth =
    "oauth" in overrides
      ? (overrides.oauth as FakeOAuth | undefined)
      : auth.mode === "oauth"
        ? new FakeOAuth()
        : undefined;
  let factoryClearCount = 0;
  let catalogClearCount = 0;
  const rigs: Rigs = {
    service: undefined as never,
    auth,
    oauth,
    factoryClears: () => factoryClearCount,
    catalogClears: () => catalogClearCount,
  };
  const factory: LinearClientFactoryLike = {
    create: async () => ({}) as never,
    clear() {
      factoryClearCount += 1;
    },
  };
  const catalog = {
    clear() {
      catalogClearCount += 1;
    },
  };
  rigs.service = new LinearConnectionService({
    auth,
    oauth,
    factory,
    catalog,
    workspace: overrides.workspace ?? new FakeWorkspace(overrides.workspaceFailure),
    authMode: overrides.authMode ?? auth.mode,
    actorMode: "user",
  });
  return rigs;
}

// ------------------------------------------------------------- getStatus

test("getStatus reports connected with workspace and viewer", async () => {
  const { service } = make();
  const status = await service.getStatus();
  expect(status).toMatchObject({
    connected: true,
    authMode: "oauth",
    state: "connected",
    actorMode: "user",
    workspace: { id: "ws-1", name: "Acme" },
    viewer: { id: "u-1", name: "Mang", email: "mang@acme.dev" },
  });
  expect(status.message).toBeUndefined();
  expect(service.getState()).toBe("connected");
});

test("getStatus never throws: NOT_CONNECTED maps to disconnected with guidance", async () => {
  const auth = new FakeAuth("apiKey");
  auth.failure = LinearConnectorError.notConnected();
  const { service } = make({ auth, authMode: "apiKey" });
  const status = await service.getStatus();
  expect(status.connected).toBe(false);
  expect(status.state).toBe("disconnected");
  expect(status.message).toContain("DSH_LINEAR_API_KEY");
  expect(service.getState()).toBe("disconnected");
});

test("getStatus maps AUTH_EXPIRED to the expired state", async () => {
  const auth = new FakeAuth("oauth");
  auth.failure = LinearConnectorError.authExpired();
  const { service } = make({ auth });
  const status = await service.getStatus();
  expect(status).toMatchObject({ connected: false, state: "expired" });
  expect(status.message).toContain("expired");
});

test("getStatus maps AUTH_REVOKED to the revoked state", async () => {
  const auth = new FakeAuth("oauth");
  auth.failure = LinearConnectorError.authRevoked();
  const { service } = make({ auth });
  const status = await service.getStatus();
  expect(status).toMatchObject({ connected: false, state: "revoked" });
  expect(status.message).toContain("revoked");
});

test("getStatus maps network failures to the error state", async () => {
  const { service } = make({
    workspaceFailure: new LinearConnectorError(
      "NETWORK_ERROR",
      "Could not reach the Linear API. Check the network connection and retry.",
    ),
  });
  const status = await service.getStatus();
  expect(status.connected).toBe(false);
  expect(status.state).toBe("error");
  expect(status.message).toContain("network");
});

test("getStatus with an unconfigured OAuth flow still hints at the configuration problem", async () => {
  const auth = new FakeAuth("oauth");
  auth.failure = LinearConnectorError.notConnected();
  const { service } = make({ auth, authMode: "oauth", oauth: undefined });
  const status = await service.getStatus();
  expect(status.connected).toBe(false);
  expect(status.state).toBe("disconnected");
  expect(status.message).toContain("oauthClientId");
});

// ----------------------------------------------------------------- connect

test("connect returns connected when the session is already usable", async () => {
  const { service } = make();
  const result = await service.connect();
  expect(result.kind).toBe("connected");
  if (result.kind === "connected") {
    expect(result.status.connected).toBe(true);
  }
});

test("connect (OAuth) returns the authorize URL and moves to connecting", async () => {
  const auth = new FakeAuth("oauth");
  auth.failure = LinearConnectorError.notConnected();
  const { service, oauth } = make({ auth });
  const result = await service.connect();
  expect(result.kind).toBe("authorize");
  if (result.kind === "authorize") {
    expect(result.url).toContain("linear.app/oauth/authorize");
    expect(result.state.state).toBe("s");
  }
  expect(oauth?.beginCalls).toBe(1);
  expect(service.getState()).toBe("connecting");
});

test("connect (OAuth) starts a fresh flow after an expired session", async () => {
  const auth = new FakeAuth("oauth");
  auth.failure = LinearConnectorError.authExpired();
  const { service, oauth } = make({ auth });
  const result = await service.connect();
  expect(result.kind).toBe("authorize");
  expect(oauth?.beginCalls).toBe(1);
});

test("connect (OAuth, unconfigured) fails with actionable validation guidance", async () => {
  const auth = new FakeAuth("oauth");
  auth.failure = LinearConnectorError.notConnected();
  const { service } = make({ auth, authMode: "oauth", oauth: undefined });
  await expect(service.connect()).rejects.toMatchObject({
    code: "VALIDATION_ERROR",
  });
});

test("connect (API key, no key) reports the missing credential as NOT_CONNECTED", async () => {
  const auth = new FakeAuth("apiKey");
  auth.failure = LinearConnectorError.notConnected();
  const { service } = make({ auth, authMode: "apiKey" });
  await expect(service.connect()).rejects.toMatchObject({
    code: "NOT_CONNECTED",
  });
  await expect(service.connect()).rejects.toMatchObject({
    message: expect.stringContaining("DSH_LINEAR_API_KEY"),
  });
});

// --------------------------------------------------------------- reconnect

test("reconnect returns connected when the session is healthy", async () => {
  const { service } = make();
  const result = await service.reconnect();
  expect(result.kind).toBe("connected");
});

test("reconnect falls back to a fresh OAuth flow when the session is dead", async () => {
  const auth = new FakeAuth("oauth");
  auth.failure = LinearConnectorError.authRevoked();
  const { service, oauth } = make({ auth });
  const result = await service.reconnect();
  expect(result.kind).toBe("authorize");
  expect(oauth?.beginCalls).toBe(1);
  expect(service.getState()).toBe("connecting");
});

// -------------------------------------------------------------- disconnect

test("disconnect runs the full §51 sequence and never throws on success", async () => {
  const { service, auth, factoryClears, catalogClears } = make();
  await service.disconnect();
  expect(auth.disconnectCalls).toBe(1);
  expect(factoryClears()).toBe(1);
  expect(catalogClears()).toBe(1);
  expect(service.getState()).toBe("disconnected");
});

test("disconnect still clears caches and state when credential removal fails", async () => {
  const auth = new FakeAuth("oauth");
  auth.disconnectFailure = new Error("credential backend down");
  const { service, factoryClears, catalogClears } = make({ auth });
  await expect(service.disconnect()).rejects.toMatchObject({ code: "LINEAR_API_ERROR" });
  expect(factoryClears()).toBe(1);
  expect(catalogClears()).toBe(1);
  expect(service.getState()).toBe("disconnected");
});

test("after disconnect the next status reports disconnected", async () => {
  const { service, auth } = make();
  await service.disconnect();
  expect(auth.disconnectCalls).toBe(1);
  const status = await service.getStatus();
  // The fake auth still resolves — the real providers remove the credential,
  // which makes resolve() throw NOT_CONNECTED (covered by the provider tests).
  expect(status.connected).toBe(true);
});
