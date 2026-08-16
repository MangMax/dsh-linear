/**
 * Token refresh with single-flight (plan §21, §22).
 *
 * Linear refresh tokens rotate: two concurrent refreshes against the same
 * old refresh token would invalidate each other (second one gets a 401).
 * `RefreshCoordinator` therefore guarantees that a connection performs at
 * most one refresh at a time — this is a correctness requirement, not an
 * optimization.
 */
import type { LinearOAuthTokenBundle } from "./token-store.ts";

/** Performs one OAuth refresh; implemented with `oauth4webapi` in Milestone 5. */
export interface TokenRefresher {
  refresh(bundle: LinearOAuthTokenBundle): Promise<LinearOAuthTokenBundle>;
}

export class RefreshCoordinator {
  private refreshPromise?: Promise<LinearOAuthTokenBundle>;

  constructor(private readonly refresher: TokenRefresher) {}

  async refreshOnce(bundle: LinearOAuthTokenBundle): Promise<LinearOAuthTokenBundle> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.refresher.refresh(bundle);

    try {
      // `await` is REQUIRED here: the `finally` must run only after the
      // refresh settles, so concurrent callers share one in-flight refresh
      // instead of each starting their own (plan §22).
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = undefined;
    }
  }
}
