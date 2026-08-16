/**
 * Connection lifecycle service (plan §50–§52; Milestone 6).
 *
 * Owns the plugin-internal connection state machine
 * (`disconnected / connecting / connected / expired / revoked / error`) and
 * the user-facing actions:
 *
 * - {@link LinearConnectionService.getStatus} — never throws; the model /
 *   UI gets a yes/no answer plus facts and a friendly one-line summary.
 *   The OAuth path re-resolves the credential (proactive refresh, §21) so a
 *   healthy session reports `connected` and a dead one reports `expired` /
 *   `revoked` without an extra round-trip.
 * - {@link LinearConnectionService.connect} — OAuth: starts the interactive
 *   flow and returns the `linear.app/oauth/authorize` URL (§17, §49); API
 *   key: verifies the stored key (there is no interactive flow — the key is
 *   configured through credentials, §16).
 * - {@link LinearConnectionService.disconnect} — the §51 sequence:
 *   best-effort OAuth revocation, local credential removal, in-memory client
 *   drop, metadata-cache drop, state update. Never deletes Linear data.
 * - {@link LinearConnectionService.reconnect} — re-validates the session
 *   (OAuth refreshes proactively) and falls back to a fresh Connect flow
 *   when the session is dead; for API-key mode this is `connect`.
 *
 * The service is deliberately thin: it composes the auth layer, the client
 * factory, the metadata catalog and the workspace service, and holds no
 * credentials itself. It is provided to the harness context as the
 * `linearConnector` service so a configuration UI / host can drive
 * connect / disconnect / reconnect and poll the state (§50).
 */
import { LinearConnectorError } from "../error.ts";
import type { LinearAuth } from "../../auth/auth-service.ts";
import type { OAuthProvider } from "../../auth/oauth-provider.ts";
import type { PendingOAuthState } from "../../auth/oauth-state.ts";
import type { LinearClientFactoryLike } from "../client-factory.ts";
import type {
  ActorMode,
  AuthMode,
  ConnectionState,
  ConnectionStatus,
} from "../../model/connection.ts";
import type { ConnectionStatusService, WorkspaceService } from "./workspace-service.ts";

/** The catalog surface disconnect needs (plan §51.4). */
export interface CatalogClearable {
  clear(): void;
}

/** Result of `connect()` / `reconnect()` (plan §49–§50). */
export type LinearConnectResult =
  | {
      /** The user must open this URL in a browser to complete OAuth. */
      kind: "authorize";
      url: string;
      /** The pending PKCE state consumed by the callback (plan §19). */
      state: PendingOAuthState;
    }
  | {
      /** The connection was already usable; no interactive step needed. */
      kind: "connected";
      status: ConnectionStatus;
    };

export interface LinearConnectionServiceOptions {
  /** Credential resolver / revoker; both providers implement this (§15–§16). */
  auth: LinearAuth;
  /**
   * The OAuth flow, present only in OAuth mode. `undefined` when
   * `authMode === "oauth"` but the flow is not fully configured (missing
   * `oauthClientId` / `redirectUri`) — a stored bundle still works, but
   * `connect()` reports the configuration problem (plan §23).
   */
  oauth?: OAuthProvider;
  factory: LinearClientFactoryLike;
  catalog: CatalogClearable;
  workspace: WorkspaceService;
  authMode: AuthMode;
  actorMode?: ActorMode;
}

export interface LinearConnectionServiceLike extends ConnectionStatusService {
  readonly mode: AuthMode;
  /** The current lifecycle state, without network activity (§50). */
  getState(): ConnectionState;
  getStatus(): Promise<ConnectionStatus>;
  connect(): Promise<LinearConnectResult>;
  disconnect(): Promise<void>;
  reconnect(): Promise<LinearConnectResult>;
}

export class LinearConnectionService implements LinearConnectionServiceLike {
  private state: ConnectionState = "disconnected";

  constructor(private readonly options: LinearConnectionServiceOptions) {}

  get mode(): AuthMode {
    return this.options.authMode;
  }

  getState(): ConnectionState {
    return this.state;
  }

  /** {@link ConnectionStatusService} seam used by `linear_connection_status`. */
  getConnectionStatus(): Promise<ConnectionStatus> {
    return this.getStatus();
  }

  /**
   * Never throws: the caller needs a yes/no answer plus facts, not a stack
   * trace. Every failure mode is mapped to a lifecycle state and a friendly
   * one-line summary (plan §35, §50).
   */
  async getStatus(): Promise<ConnectionStatus> {
    const base: ConnectionStatus = {
      connected: false,
      authMode: this.options.authMode,
      actorMode: this.options.actorMode,
    };

    // Resolving the credential is the auth boundary: API-key mode reads the
    // stored key, OAuth mode returns a non-expired access token (proactive
    // refresh, §21) or throws NOT_CONNECTED / AUTH_EXPIRED / AUTH_REVOKED.
    try {
      await this.options.auth.resolve();
    } catch (err) {
      return this.failedStatus(base, err);
    }

    try {
      const [workspace, viewer] = await Promise.all([
        this.options.workspace.getWorkspace(),
        this.options.workspace.getViewer(),
      ]);
      this.state = "connected";
      return {
        ...base,
        connected: true,
        state: "connected",
        workspace,
        viewer,
      };
    } catch (err) {
      return this.failedStatus(base, err);
    }
  }

  /**
   * Start (or confirm) a connection (plan §49). OAuth returns the authorize
   * URL and moves to `connecting`; the callback route completes the flow and
   * the next status poll flips to `connected`. API-key mode verifies the
   * stored key — with no key it reports the configuration problem.
   */
  async connect(): Promise<LinearConnectResult> {
    const status = await this.getStatus();
    if (status.connected) {
      return { kind: "connected", status };
    }

    if (this.options.authMode === "oauth") {
      if (!this.options.oauth) {
        throw LinearConnectorError.validation(
          "The OAuth flow is not configured. Set linear.oauthClientId and linear.redirectUri, and register the callback URL in the Linear OAuth app (plan §23).",
        );
      }
      try {
        const pending = await this.options.oauth.beginAuthorization();
        this.state = "connecting";
        return { kind: "authorize", url: pending.url, state: pending.state };
      } catch (err) {
        this.state = "error";
        throw this.friendly(err);
      }
    }

    // API-key mode has no interactive flow: the key is a credential the user
    // configures outside the connector (plan §16). Report the missing key.
    throw LinearConnectorError.notConnectedWith(this.connectHint());
  }

  /**
   * Reconnect (plan §50): re-validate the session and — for OAuth — fall
   * back to a fresh authorization flow when the session is dead
   * (`expired` / `revoked` / no bundle). For API-key mode this is
   * {@link connect} (verify the stored key).
   */
  async reconnect(): Promise<LinearConnectResult> {
    const status = await this.getStatus();
    if (status.connected) {
      return { kind: "connected", status };
    }
    return this.connect();
  }

  /**
   * Disconnect (plan §51):
   *
   * 1. best-effort OAuth revocation at Linear;
   * 2. remove the local credential (bundle / API key);
   * 3. drop the in-memory client state;
   * 4. clear the metadata cache;
   * 5. move the state machine to `disconnected`;
   * 6. Linear data is never touched — the connector has no delete
   *    operations (plan §11, §36).
   *
   * Credential removal failure is reported (the caller should know the
   * secret may still be present) but never blocks the in-memory cleanup.
   */
  async disconnect(): Promise<void> {
    let cleanupError: unknown;
    try {
      await this.options.auth.disconnect();
    } catch (err) {
      cleanupError = err;
    }
    this.options.factory.clear();
    this.options.catalog.clear();
    this.state = "disconnected";
    if (cleanupError) {
      throw this.friendly(cleanupError);
    }
  }

  // ------------------------------------------------------------ internals

  private failedStatus(base: ConnectionStatus, err: unknown): ConnectionStatus {
    if (err instanceof LinearConnectorError) {
      switch (err.code) {
        case "NOT_CONNECTED":
          this.state = "disconnected";
          return { ...base, state: "disconnected", message: this.connectHint() };
        case "AUTH_EXPIRED":
          this.state = "expired";
          return {
            ...base,
            state: "expired",
            message: "The Linear session has expired. Reconnect to continue.",
          };
        case "AUTH_REVOKED":
          this.state = "revoked";
          return {
            ...base,
            state: "revoked",
            message: "The Linear connection was revoked. Reconnect to continue.",
          };
        default:
          this.state = "error";
          return { ...base, state: "error", message: err.message };
      }
    }
    this.state = "error";
    return {
      ...base,
      state: "error",
      message: "Could not check the Linear connection. Check the network and retry.",
    };
  }

  /** Mode-specific, actionable guidance for a not-connected state (§50). */
  private connectHint(): string {
    if (this.options.authMode === "oauth") {
      if (!this.options.oauth) {
        return (
          "Linear is not connected and the OAuth flow is not configured. " +
          "Set linear.oauthClientId and linear.redirectUri, or switch to linear.authMode = 'apiKey' " +
          "with the DSH_LINEAR_API_KEY credential."
        );
      }
      return (
        "Linear is not connected. Start the Connect flow to authorize this workspace (OAuth), " +
        "or set linear.authMode = 'apiKey' with the DSH_LINEAR_API_KEY credential."
      );
    }
    return (
      "Linear is not connected. Set the DSH_LINEAR_API_KEY credential " +
      "(a Linear personal API key), then reconnect."
    );
  }

  /** Normalize unexpected failures so they never reach callers raw (plan §35). */
  private friendly(err: unknown): LinearConnectorError {
    if (err instanceof LinearConnectorError) {
      return err;
    }
    return new LinearConnectorError(
      "LINEAR_API_ERROR",
      "The Linear connection could not be updated. Retry later.",
      { cause: err },
    );
  }
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    /**
     * The connection lifecycle service provided by dsh-linear (plan §50):
     * poll `getStatus()` for the connection card, drive
     * connect / disconnect / reconnect.
     */
    linearConnector: LinearConnectionServiceLike;
  }
}
