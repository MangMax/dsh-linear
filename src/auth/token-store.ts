/**
 * Token bundle persistence (plan §20, §25).
 *
 * The access token and refresh token are one logical unit: they are
 * serialized into a single secret and written/updated atomically. Linear uses
 * rotating refresh tokens, so a refresh that returns no new refresh token
 * must keep the old one — the bundle is replaced whole, never field by field.
 */
import type { ActorMode } from "../model/connection.ts";
import type { SecretStore } from "../harness/credentials.ts";

export interface LinearOAuthTokenBundle {
  accessToken: string;
  refreshToken: string;
  /** Unix timestamp in milliseconds. */
  expiresAt: number;
  scope: string[];
  tokenType: string;
  workspaceId?: string;
  workspaceName?: string;
  actorMode: ActorMode;
}

/**
 * Persists the bundle under one credential ref (e.g. `DSH_LINEAR_OAUTH`)
 * through the harness {@link SecretStore}.
 */
export class TokenStore {
  constructor(
    private readonly store: SecretStore,
    private readonly ref: string,
  ) {}

  async read(): Promise<LinearOAuthTokenBundle | undefined> {
    const raw = await this.store.get(this.ref);
    if (!raw) return undefined;
    return JSON.parse(raw) as LinearOAuthTokenBundle;
  }

  async write(bundle: LinearOAuthTokenBundle): Promise<void> {
    await this.store.set(this.ref, JSON.stringify(bundle));
  }

  async delete(): Promise<void> {
    await this.store.delete(this.ref);
  }
}
