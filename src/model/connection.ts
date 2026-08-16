/**
 * Connection-related canonical models (plan §10.1, §24, §50, §52).
 */

export type AuthMode = "oauth" | "apiKey";

export type ActorMode = "user" | "app";

export type WritePolicy = "ask" | "allow" | "deny";

/** Plugin-internal connection lifecycle state (plan §50). */
export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "expired"
  | "revoked"
  | "error";

export interface WorkspaceInfo {
  id: string;
  name: string;
}

export interface ViewerInfo {
  id: string;
  name: string;
  email?: string;
}

/**
 * Returned by `linear_connection_status` — never contains tokens.
 *
 * Milestone 6 (§50) adds the plugin-internal lifecycle state and a
 * human-friendly one-line summary so the model / UI can distinguish a fresh
 * install (disconnected) from an expired or revoked session without another
 * round-trip.
 */
export interface ConnectionStatus {
  connected: boolean;
  authMode?: AuthMode;
  /** Plugin-internal lifecycle state (plan §50); present since Milestone 6. */
  state?: ConnectionState;
  /** Actor mode of the stored OAuth bundle, when known (§24). */
  actorMode?: ActorMode;
  /**
   * One-line human-friendly summary (e.g. what to do next when not
   * connected). Never contains secrets.
   */
  message?: string;
  workspace?: WorkspaceInfo;
  viewer?: ViewerInfo;
}

/**
 * One workspace connection (plan §52). MVP activates a single connection,
 * but the auth layer must not assume a global singleton.
 */
export interface LinearConnection {
  id: string;
  workspaceId: string;
  workspaceName: string;
  credentialRef: string;
  actorMode: ActorMode;
}
