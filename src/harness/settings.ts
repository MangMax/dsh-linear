/**
 * Settings adapter (plan §7, §26).
 *
 * Settings hold refs and behavior preferences only — secrets NEVER enter
 * settings (see §25). Wired to `ctx.settings` in `src/harness/plugin.ts`.
 */
import type { ActorMode, AuthMode, WritePolicy } from "../model/connection.ts";

/** Minimal settings the connector needs to operate (plan §7). */
export interface ConnectorSettings {
  authMode: AuthMode;
  credentialRef: string;
  defaultTeam?: string;
  defaultProject?: string;
  writePolicy: WritePolicy;
}

/** Full plugin config surface (plan §26). */
export interface LinearSettings extends ConnectorSettings {
  oauthClientId?: string;
  oauthClientSecret?: string;
  /** Must match a registered redirect URI in the Linear OAuth app (§23). */
  redirectUri?: string;
  actorMode?: ActorMode;
  /**
   * Milestone 8 — Linear Agent Mode (§41): receive `AgentSessionEvent`
   * webhooks on {@link WEBHOOK_PATH} and bridge them to harness agents.
   * Requires `authMode: "oauth"` + `actorMode: "app"` (an app-user OAuth
   * app with the "agent session events" webhook category enabled).
   */
  agentMode?: boolean;
  /**
   * Credential ref holding the webhook signing secret (§25). The secret
   * itself never enters settings; the ref is re-resolved per request.
   */
  webhookSecretRef?: string;
  /** Optional model route for dispatched harness agents (agent mode). */
  agentProvider?: string;
  agentModel?: string;
  /** Optional harness agent preset id (e.g. `cordis`) for fresh sessions. */
  agentPreset?: string;
  searchLimit?: number;
  commentsLimit?: number;
}

export const DEFAULT_AUTH_MODE: AuthMode = "oauth";
export const DEFAULT_ACTOR_MODE: ActorMode = "user";
export const DEFAULT_WRITE_POLICY: WritePolicy = "ask";
export const DEFAULT_CREDENTIAL_REF = "DSH_LINEAR_OAUTH";
/** API-key mode default ref (§16); see {@link credentialRefFor}. */
export const DEFAULT_API_KEY_REF = "DSH_LINEAR_API_KEY";
export const DEFAULT_AGENT_MODE = false;
/** Must match {@link WEBHOOK_SECRET_REF} in `src/agent/webhook.ts` (§25). */
export const DEFAULT_WEBHOOK_SECRET_REF = "DSH_LINEAR_WEBHOOK_SECRET";
export const DEFAULT_SEARCH_LIMIT = 20;
export const DEFAULT_COMMENTS_LIMIT = 20;

/**
 * Resolve the effective credential ref for the active auth mode (M7 live
 * switching). `credentialRef` is a single settings field whose default is the
 * OAuth ref; when it still names that default (or nothing) the apiKey mode
 * uses its own documented ref instead — so flipping authMode live (oauth ⇄
 * apiKey) always lands on the right credential without touching the config.
 * An explicitly configured custom ref is honored verbatim.
 */
export function credentialRefFor(mode: AuthMode, credentialRef?: string): string {
  if (mode === "apiKey") {
    if (!credentialRef || credentialRef === DEFAULT_CREDENTIAL_REF) {
      return DEFAULT_API_KEY_REF;
    }
  }
  return credentialRef ?? DEFAULT_CREDENTIAL_REF;
}
