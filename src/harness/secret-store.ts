/**
 * Harness credentials adapter (plan §7, §25).
 *
 * {@link HarnessSecretStore} wires the plugin's {@link SecretStore} seam to
 * `ctx.credentials` (the DSH credential-reference provider). All secrets —
 * API keys, OAuth bundles, webhook secrets — flow through this single adapter;
 * business code never touches `ctx.credentials` directly.
 *
 * The DSH seam is reference-based: consumers resolve a *reference* (a POSIX
 * shell identifier such as `DSH_LINEAR_API_KEY`) once per operation, so a
 * changed credential reaches the next operation without a plugin restart.
 * References are branded with {@link credentialRef}; an invalid configured ref
 * is a configuration error and is surfaced as a VALIDATION_ERROR instead of
 * a low-level TypeError.
 */
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { LinearConnectorError } from "../linear/error.ts";
import type { SecretStore } from "./credentials.ts";

/** Structural view of the DSH credential provider we consume. */
export interface CredentialProviderLike {
  resolve(ref: unknown): Promise<{ value: string; source: string } | undefined>;
  set(ref: unknown, value: string): Promise<void>;
  unset(ref: unknown): Promise<void>;
}

function toRef(ref: string): unknown {
  try {
    return credentialRef(ref);
  } catch {
    throw LinearConnectorError.validation(
      `credentialRef "${ref}" is not a valid credential reference (expected a POSIX shell identifier such as DSH_LINEAR_API_KEY).`,
    );
  }
}

export class HarnessSecretStore implements SecretStore {
  constructor(private readonly provider: CredentialProviderLike) {}

  async get(ref: string): Promise<string | undefined> {
    const resolved = await this.provider.resolve(toRef(ref));
    return resolved?.value;
  }

  async set(ref: string, value: string): Promise<void> {
    await this.provider.set(toRef(ref), value);
  }

  async delete(ref: string): Promise<void> {
    await this.provider.unset(toRef(ref));
  }
}
