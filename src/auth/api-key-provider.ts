/**
 * Personal API key provider (plan §16).
 *
 * Reads the key from the harness {@link SecretStore} by ref (e.g.
 * `DSH_LINEAR_API_KEY`) — the key itself never lives in settings or config.
 * Used for local development, debug, CI E2E, headless profiles, and as an
 * OAuth fallback.
 */
import { LinearConnectorError } from "../linear/error.ts";
import type { SecretStore } from "../harness/credentials.ts";
import type { LinearAuth, ResolvedLinearAuth } from "./auth-service.ts";

export class ApiKeyProvider implements LinearAuth {
  readonly mode = "apiKey" as const;

  constructor(
    private readonly store: SecretStore,
    private readonly ref: string,
  ) {}

  async resolve(): Promise<ResolvedLinearAuth> {
    const apiKey = await this.store.get(this.ref);
    if (!apiKey) {
      throw LinearConnectorError.notConnected();
    }
    return { type: "apiKey", apiKey };
  }

  async getValidAccessToken(): Promise<string> {
    // The API key IS the credential; there is no access token to refresh.
    throw LinearConnectorError.validation(
      "API key mode has no access token; use the API key directly.",
    );
  }

  async disconnect(): Promise<void> {
    await this.store.delete(this.ref);
  }
}
