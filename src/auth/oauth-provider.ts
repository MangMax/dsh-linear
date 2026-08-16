/**
 * OAuth provider (plan §17–§24; Milestone 5).
 *
 * Authorization Code + PKCE S256 against Linear, implemented with
 * `oauth4webapi` (plan §18): the PKCE challenge, authorization-response
 * validation, refresh request protocol and OAuth response parsing are never
 * hand-rolled.
 *
 * - `beginAuthorization()` — builds the `linear.app/oauth/authorize` URL with
 *   a PKCE S256 `code_challenge`, `state`, the minimal v0.x scope (`read`,
 *   `write`, §58) and `actor` from
 *   {@link OAuthProviderOptions.actorMode} (§24 — never hardcoded).
 * - `handleCallback()` — consumes and validates `state` against the
 *   in-memory store (mandatory, §19), exchanges the code with the PKCE
 *   `code_verifier` (`client_secret` optional for PKCE, 附录 A.4) and
 *   persists the whole token bundle as a single secret (§20).
 * - `getValidAccessToken()` — refreshes proactively when
 *   `expiresAt - now <= 5 min` (§21) through a single-flight coordinator
 *   (§22): Linear rotates refresh tokens, so a connection performs at most
 *   one refresh at a time — this is a correctness requirement, not an
 *   optimization.
 * - `refresh()` — rotation-safe: a refresh response may omit
 *   `refresh_token`; the previous one is then kept (§21, 附录 A.4).
 * - `revoke()` / `disconnect()` — best-effort revocation at Linear, then
 *   unconditional local cleanup (§18, §51).
 */
import {
  ClientSecretPost,
  None,
  ResponseBodyError,
  WWWAuthenticateChallengeError,
  authorizationCodeGrantRequest,
  calculatePKCECodeChallenge,
  generateRandomCodeVerifier,
  generateRandomState,
  processAuthorizationCodeResponse,
  processRefreshTokenResponse,
  processRevocationResponse,
  refreshTokenGrantRequest,
  revocationRequest,
  validateAuthResponse,
  type AuthorizationServer,
  type Client,
  type ClientAuth,
  type TokenEndpointResponse,
} from "oauth4webapi";
import { LinearConnectorError } from "../linear/error.ts";
import type { ActorMode } from "../model/connection.ts";
import type { LinearAuth, ResolvedLinearAuth } from "./auth-service.ts";
import { InMemoryOAuthStateStore } from "./oauth-state.ts";
import { RefreshCoordinator, type TokenRefresher } from "./token-refresh.ts";
import { TokenStore, type LinearOAuthTokenBundle } from "./token-store.ts";

/** Linear OAuth endpoints (附录 A.4). */
export const LINEAR_AUTHORIZE_ENDPOINT = "https://linear.app/oauth/authorize";
export const LINEAR_TOKEN_ENDPOINT = "https://api.linear.app/oauth/token";
export const LINEAR_REVOKE_ENDPOINT = "https://api.linear.app/oauth/revoke";

/**
 * Minimal scope for v0.x — `admin` is never requested (§58).
 *
 * Verified against Linear's OAuth 2.0 docs (2026): the valid scopes are
 * `read`, `write`, `issues:create`, `comments:create`, `timeSchedule:write`
 * and `admin` — there is NO `issues:write`; the authorize endpoint rejects
 * it with "Invalid scope" (surfaced by the real web OAuth test). `read,write`
 * covers every v0.x tool (issue create/update, comments) without admin.
 */
export const DEFAULT_OAUTH_SCOPE = ["read", "write"];

/** Refresh proactively when the access token has at most this much life left (§21). */
export const OAUTH_REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

const MAX_ERROR_DETAIL_LENGTH = 200;

function sanitizeDetail(detail: string | undefined): string | undefined {
  if (!detail) return undefined;
  const firstLine = detail.split(/\r?\n/)[0]?.trim() ?? detail;
  return firstLine.length > MAX_ERROR_DETAIL_LENGTH
    ? `${firstLine.slice(0, MAX_ERROR_DETAIL_LENGTH)}…`
    : firstLine;
}

export interface OAuthProviderOptions {
  clientId: string;
  /** Optional when PKCE is used (Linear supports verifier-only exchange). */
  clientSecret?: string;
  /** Must match a registered redirect URI in the Linear OAuth app (§23). */
  redirectUri: string;
  actorMode: "user" | "app";
  /** Minimal scope; v0.x: `read`, `write` (§58). */
  scope: string[];
}

export interface BeginAuthorizationResult {
  /** URL to open in the user's browser (linear.app/oauth/authorize). */
  url: string;
  state: {
    state: string;
    codeVerifier: string;
    redirectUri: string;
    createdAt: number;
  };
}

export interface OAuthCallbackParams {
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

export interface OAuthProvider {
  beginAuthorization(): Promise<BeginAuthorizationResult>;
  /** Validates state, exchanges the code, persists the token bundle. */
  handleCallback(params: OAuthCallbackParams): Promise<LinearOAuthTokenBundle>;
  /** Best-effort revocation at Linear, then local cleanup. */
  revoke(): Promise<void>;
}

/**
 * The M5 OAuth implementation: implements {@link LinearAuth} so the client
 * factory and every tool go through the same seam, {@link OAuthProvider} so
 * the callback route / Connect UX can drive the flow, and {@link TokenRefresher}
 * so {@link RefreshCoordinator} enforces one in-flight refresh per connection.
 */
export class LinearOAuthProvider implements LinearAuth, OAuthProvider, TokenRefresher {
  readonly mode = "oauth" as const;

  private readonly coordinator: RefreshCoordinator;

  constructor(
    private readonly options: OAuthProviderOptions,
    private readonly tokens: TokenStore,
    private readonly stateStore: InMemoryOAuthStateStore = new InMemoryOAuthStateStore(),
    private readonly now: () => number = () => Date.now(),
  ) {
    this.coordinator = new RefreshCoordinator(this);
  }

  /** Authorization server metadata (附录 A.4). `issuer` is only used for `iss` checks. */
  private get as(): AuthorizationServer {
    return {
      issuer: "https://linear.app",
      authorization_endpoint: LINEAR_AUTHORIZE_ENDPOINT,
      token_endpoint: LINEAR_TOKEN_ENDPOINT,
      revocation_endpoint: LINEAR_REVOKE_ENDPOINT,
    };
  }

  private get client(): Client {
    return { client_id: this.options.clientId };
  }

  private get clientAuth(): ClientAuth {
    // PKCE token exchange makes `client_secret` optional (附录 A.4): a public
    // client authenticates with `client_id` in the request body only.
    return this.options.clientSecret ? ClientSecretPost(this.options.clientSecret) : None();
  }

  async beginAuthorization(): Promise<BeginAuthorizationResult> {
    const state = generateRandomState();
    const codeVerifier = generateRandomCodeVerifier();
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
    const pending = {
      state,
      codeVerifier,
      redirectUri: this.options.redirectUri,
      createdAt: this.now(),
    };
    this.stateStore.put(pending);

    const query = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: this.options.redirectUri,
      response_type: "code",
      // Linear expects a comma-separated scope list (OAuth 2.0 docs).
      scope: this.options.scope.join(","),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      actor: this.options.actorMode,
      prompt: "consent",
    });

    return { url: `${LINEAR_AUTHORIZE_ENDPOINT}?${query.toString()}`, state: pending };
  }

  async handleCallback(params: OAuthCallbackParams): Promise<LinearOAuthTokenBundle> {
    if (!params.state) {
      throw LinearConnectorError.validation(
        "OAuth callback is missing the state parameter. Start a new Connect flow.",
      );
    }
    // Consume + TTL-check the pending state FIRST: state validation is
    // mandatory, and a used/unknown/expired state must reject the attempt (§19).
    const pending = this.stateStore.take(params.state);
    if (!pending) {
      throw LinearConnectorError.validation(
        "OAuth state is unknown, already used, or expired. Start a new Connect flow.",
      );
    }

    // An explicit authorization error response is handled BEFORE state
    // validation — Linear may omit `state` on error redirects.
    if (params.error) {
      const detail = sanitizeDetail(params.errorDescription);
      throw LinearConnectorError.permissionDenied(
        detail
          ? `The Linear authorization was not granted: ${detail}`
          : `The Linear authorization was not granted (${params.error}). Start a new Connect flow.`,
      );
    }

    const query = new URLSearchParams();
    if (params.code) query.set("code", params.code);
    if (params.state) query.set("state", params.state);

    // Validates the authorization response (state equality) — plan §18, §19.
    // The returned (branded) parameters are what the token grant request
    // accepts as `callbackParameters`.
    const validated = validateAuthResponse(this.as, this.client, query, pending.state);

    if (!params.code) {
      throw LinearConnectorError.validation(
        "OAuth callback did not include an authorization code. Start a new Connect flow.",
      );
    }

    try {
      const response = await authorizationCodeGrantRequest(
        this.as,
        this.client,
        this.clientAuth,
        validated,
        pending.redirectUri,
        pending.codeVerifier,
      );
      const parsed = await processAuthorizationCodeResponse(this.as, this.client, response);
      const bundle = this.toBundle(parsed, this.options.actorMode);
      await this.tokens.write(bundle);
      return bundle;
    } catch (err) {
      throw this.mapTokenError(err);
    }
  }

  /**
   * Returns a non-expired access token; refreshes (single-flight) when the
   * bundle is within {@link OAUTH_REFRESH_THRESHOLD_MS} of expiry (§21–§22).
   */
  async getValidAccessToken(): Promise<string> {
    const bundle = await this.tokens.read();
    if (!bundle) {
      throw new LinearConnectorError(
        "NOT_CONNECTED",
        "Linear is not connected via OAuth. Connect the workspace, or set linear.authMode = 'apiKey' to use a personal API key.",
      );
    }
    if (this.now() < bundle.expiresAt - OAUTH_REFRESH_THRESHOLD_MS) {
      return bundle.accessToken;
    }
    const refreshed = await this.coordinator.refreshOnce(bundle);
    await this.tokens.write(refreshed);
    return refreshed.accessToken;
  }

  async resolve(): Promise<ResolvedLinearAuth> {
    return { type: "oauth", accessToken: await this.getValidAccessToken() };
  }

  /** {@link TokenRefresher}: one OAuth refresh; single-flight lives in the coordinator. */
  async refresh(bundle: LinearOAuthTokenBundle): Promise<LinearOAuthTokenBundle> {
    try {
      const response = await refreshTokenGrantRequest(
        this.as,
        this.client,
        this.clientAuth,
        bundle.refreshToken,
      );
      const parsed = await processRefreshTokenResponse(this.as, this.client, response);
      return this.toBundle(parsed, bundle.actorMode, bundle);
    } catch (err) {
      throw this.mapTokenError(err);
    }
  }

  /** Best-effort revocation at Linear, then unconditional local cleanup (§18, §51). */
  async revoke(): Promise<void> {
    const bundle = await this.tokens.read();
    if (bundle?.accessToken) {
      try {
        const response = await revocationRequest(
          this.as,
          this.client,
          this.clientAuth,
          bundle.accessToken,
        );
        await processRevocationResponse(response);
      } catch {
        // Revocation failures must never block disconnecting locally.
      }
    }
    await this.tokens.delete();
  }

  async disconnect(): Promise<void> {
    await this.revoke();
  }

  private toBundle(
    parsed: TokenEndpointResponse,
    actorMode: ActorMode,
    previous?: LinearOAuthTokenBundle,
  ): LinearOAuthTokenBundle {
    return {
      accessToken: parsed.access_token,
      // Linear rotates refresh tokens: a refresh response may omit
      // `refresh_token`, in which case the previous one stays valid (§21).
      refreshToken: parsed.refresh_token ?? previous?.refreshToken ?? "",
      expiresAt: this.now() + (parsed.expires_in ?? 0) * 1000,
      scope: parsed.scope ? parsed.scope.split(" ") : (previous?.scope ?? [...this.options.scope]),
      tokenType: parsed.token_type ?? previous?.tokenType ?? "Bearer",
      workspaceId: previous?.workspaceId,
      workspaceName: previous?.workspaceName,
      actorMode,
    };
  }

  private mapTokenError(err: unknown): LinearConnectorError {
    if (err instanceof LinearConnectorError) {
      return err;
    }
    if (err instanceof ResponseBodyError) {
      const detail = sanitizeDetail(err.error_description);
      if (err.status === 400) {
        return LinearConnectorError.authExpired(
          detail
            ? `The Linear OAuth session is no longer valid (${err.error}: ${detail}). Reconnect to continue.`
            : `The Linear OAuth session is no longer valid (${err.error}). Reconnect to continue.`,
        );
      }
      if (err.status === 401 || err.status === 403) {
        return LinearConnectorError.authRevoked();
      }
      if (err.status >= 500) {
        return new LinearConnectorError(
          "NETWORK_ERROR",
          "The Linear OAuth server returned an error. Retry later.",
          { cause: err },
        );
      }
      return new LinearConnectorError(
        "LINEAR_API_ERROR",
        sanitizeDetail(err.message) ?? "The Linear OAuth exchange failed.",
        { cause: err },
      );
    }
    if (err instanceof WWWAuthenticateChallengeError) {
      return LinearConnectorError.authExpired();
    }
    if (err instanceof TypeError) {
      return new LinearConnectorError(
        "NETWORK_ERROR",
        "Could not reach the Linear OAuth server. Check the network connection and retry.",
        { cause: err },
      );
    }
    if (err instanceof Error) {
      return new LinearConnectorError(
        "LINEAR_API_ERROR",
        sanitizeDetail(err.message) ?? "The Linear OAuth exchange failed.",
        { cause: err },
      );
    }
    return new LinearConnectorError("LINEAR_API_ERROR", "The Linear OAuth exchange failed.", {
      cause: err,
    });
  }
}
