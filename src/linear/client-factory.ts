/**
 * Linear client factory (plan §28, §29).
 *
 * Every `LinearClient` instance is created here from a resolved credential.
 * Domain services must NEVER read credentials, refresh tokens, or construct
 * clients themselves. Credentials are re-resolved per operation (§29) so a
 * changed or refreshed credential reaches the next operation without a
 * restart.
 *
 * Milestone 7 (plan §75): the token fingerprint → client cache (§29, §59).
 * `create()` hashes the resolved token and reuses the matching `LinearClient`
 * instead of constructing a new one per operation; when the credential
 * changes (refresh rotation, reconnect, API key swap) the fingerprint
 * changes and a fresh client is built. Each cached client is wrapped in the
 * plan §34 retry policy via {@link retryableClient} — reads retry on
 * 429/5xx/network, mutations on 429 only. `clear()` drops the cache on
 * disconnect (plan §51 step 3).
 */
import { createHash } from "node:crypto";
import { LinearClient } from "@linear/sdk";
import type { LinearAuth, ResolvedLinearAuth } from "../auth/auth-service.ts";
import { retryableClient, type LinearRetryOptions } from "./retry.ts";

/**
 * The factory seam domain services depend on. Declared as an interface so
 * contract tests can mock the boundary at the Linear client (§53.2) without
 * the nominal private members of {@link LinearClientFactory}.
 */
export interface LinearClientFactoryLike {
  create(): Promise<LinearClient>;
  /** Drop any cached client state after a disconnect (plan §51.3). */
  clear(): void;
}

export interface LinearClientFactoryOptions {
  /** Retry policy applied to every client (plan §34); defaults apply when absent. */
  retry?: LinearRetryOptions;
}

function fingerprintOf(resolved: ResolvedLinearAuth): string {
  const token = resolved.type === "apiKey" ? resolved.apiKey : resolved.accessToken;
  // Never store or log the token itself; the fingerprint only distinguishes
  // credentials (and the auth mode) for cache identity.
  const digest = createHash("sha256").update(token).digest("hex");
  return `${resolved.type}:${digest}`;
}

export class LinearClientFactory implements LinearClientFactoryLike {
  private readonly clients = new Map<string, LinearClient>();

  constructor(
    private readonly auth: LinearAuth,
    private readonly options: LinearClientFactoryOptions = {},
  ) {}

  async create(): Promise<LinearClient> {
    const resolved = await this.auth.resolve();
    const fingerprint = fingerprintOf(resolved);

    const cached = this.clients.get(fingerprint);
    if (cached) return cached;

    const client =
      resolved.type === "apiKey"
        ? new LinearClient({ apiKey: resolved.apiKey })
        : new LinearClient({ accessToken: resolved.accessToken });

    const wrapped = retryableClient(client, this.options.retry);
    this.clients.set(fingerprint, wrapped);
    return wrapped;
  }

  /** Disconnect hook (plan §51 step 3): drop cached clients; next `create()` rebuilds. */
  clear(): void {
    this.clients.clear();
  }
}
