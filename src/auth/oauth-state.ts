/**
 * OAuth transient state (plan §19).
 *
 * Authorization-code state + PKCE verifier live in memory with a 10-minute
 * TTL. They are short-lived by design: a harness restart simply requires the
 * user to reconnect, and no secret / transient state is persisted.
 */

export interface PendingOAuthState {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
}

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export class InMemoryOAuthStateStore {
  private readonly pending = new Map<string, PendingOAuthState>();

  put(entry: PendingOAuthState): void {
    this.prune();
    this.pending.set(entry.state, entry);
  }

  /**
   * Consume and validate a pending state. Returns `undefined` when the state
   * is unknown, already consumed, or expired — callers MUST reject the
   * authorization attempt in that case (state validation is mandatory).
   */
  take(state: string): PendingOAuthState | undefined {
    const entry = this.pending.get(state);
    if (!entry) return undefined;
    this.pending.delete(state);
    if (Date.now() - entry.createdAt > OAUTH_STATE_TTL_MS) {
      return undefined;
    }
    return entry;
  }

  prune(): void {
    const now = Date.now();
    for (const [state, entry] of this.pending) {
      if (now - entry.createdAt > OAUTH_STATE_TTL_MS) {
        this.pending.delete(state);
      }
    }
  }
}
