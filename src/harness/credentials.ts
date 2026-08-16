/**
 * Secret store adapter (plan §7, §25).
 *
 * The ONLY seam through which secrets (API keys, OAuth bundles, webhook
 * secrets) may be read or written. Wired to `ctx.credentials` in
 * `src/harness/plugin.ts`; business code never touches `ctx.credentials`
 * directly.
 */
export interface SecretStore {
  get(ref: string): Promise<string | undefined>;
  set(ref: string, value: string): Promise<void>;
  delete(ref: string): Promise<void>;
}
