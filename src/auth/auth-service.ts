/**
 * Auth service contract (plan §15–§22).
 *
 * Two providers implement this seam:
 * - {@link ApiKeyProvider} (`src/auth/api-key-provider.ts`)
 * - OAuthProvider (Milestone 5, `src/auth/oauth-provider.ts`)
 *
 * Tools go through {@link LinearAuth.resolve} / {@link LinearAuth.getValidAccessToken}
 * and never touch credentials directly.
 */
import type { AuthMode } from "../model/connection.ts";

export type ResolvedLinearAuth =
  | { type: "apiKey"; apiKey: string }
  | { type: "oauth"; accessToken: string };

export interface LinearAuth {
  readonly mode: AuthMode;

  /** Resolve the current credential; throws NOT_CONNECTED / AUTH_EXPIRED when unusable. */
  resolve(): Promise<ResolvedLinearAuth>;

  /**
   * OAuth mode: returns a non-expired access token, refreshing proactively
   * when `expiresAt - now <= 5 min` (plan §21). API-key mode throws
   * VALIDATION_ERROR — the key itself is the credential.
   */
  getValidAccessToken(): Promise<string>;

  /** Revoke (OAuth) and remove the stored credential (plan §51). */
  disconnect(): Promise<void>;
}
