/**
 * Settings registration (plan §26; Milestone 6).
 *
 * Registers the `linear` settings namespace with the harness user-settings
 * service (`ctx.settings`, `@deepseek-ai/dsh-settings`) so the profile
 * configuration surface can render and persist the connector settings:
 * OAuth app info, defaults and behavior preferences. Secrets never enter the
 * document — `oauthClientSecret` is declared `role('secret')` (redacted from
 * every wire surface) and the credential itself stays in `ctx.credentials`
 * (§25).
 *
 * Semantics: the namespace is registered with `applies: "live"` — user-
 * document overrides reach the RUNNING plugin immediately (the plugin
 * rebuilds its auth/domain stack in place, M7; authMode switches without a
 * restart). The plugin keeps working with its composition entry config when
 * no settings service exists (headless profile, §23), exactly like the
 * canonical `installSettingsSection` fallback.
 *
 * The schema is built with schemastery (the `z` used by dsh-settings), not
 * zod — verified against the target wave.
 */
import { Context } from "@deepseek-ai/cordis";
import Schema from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
import {
  DEFAULT_ACTOR_MODE,
  DEFAULT_AGENT_MODE,
  DEFAULT_AUTH_MODE,
  DEFAULT_COMMENTS_LIMIT,
  DEFAULT_CREDENTIAL_REF,
  DEFAULT_SEARCH_LIMIT,
  DEFAULT_WEBHOOK_SECRET_REF,
  DEFAULT_WRITE_POLICY,
  type LinearSettings,
} from "./settings.ts";

/** The settings namespace owning this plugin's configuration (lowercase
 * kebab-case, matching the plugin short name). */
export const LINEAR_SETTINGS_NAMESPACE = "linear";

/** User-facing schema for the `linear` settings section (plan §26). */
export const linearSettingsSchema = Schema.object({
  authMode: Schema.union([Schema.const("oauth"), Schema.const("apiKey")])
    .default(DEFAULT_AUTH_MODE)
    .description("How the connector authenticates: OAuth (recommended) or a personal API key."),
  credentialRef: Schema.string()
    .default(DEFAULT_CREDENTIAL_REF)
    .description(
      "Credential reference for the OAuth token bundle or API key. The secret itself never lives in settings.",
    ),
  oauthClientId: Schema.string().description(
    "Linear OAuth app client id (linear.app/settings/api → Developer settings).",
  ),
  oauthClientSecret: Schema.string()
    .role("secret")
    .description(
      "OAuth app client secret. Optional with PKCE; never sent to configuration surfaces.",
    ),
  redirectUri: Schema.string().description(
    "Callback URL, must match a registered redirect URI in the Linear OAuth app (plan §23).",
  ),
  actorMode: Schema.union([Schema.const("user"), Schema.const("app")])
    .default(DEFAULT_ACTOR_MODE)
    .description("Which identity Linear sees for connector actions (plan §24)."),
  agentMode: Schema.boolean()
    .default(DEFAULT_AGENT_MODE)
    .description(
      "Linear Agent Mode (plan §41): receive AgentSessionEvent webhooks and bridge them to harness agents. Requires an app-user OAuth app with the agent session events webhook category.",
    ),
  webhookSecretRef: Schema.string()
    .default(DEFAULT_WEBHOOK_SECRET_REF)
    .description(
      "Credential reference holding the webhook signing secret (agent mode). The secret itself never lives in settings.",
    ),
  agentProvider: Schema.string().description(
    "Optional model provider for harness agents dispatched from Linear (agent mode).",
  ),
  agentModel: Schema.string().description(
    "Optional model id for harness agents dispatched from Linear (agent mode).",
  ),
  agentPreset: Schema.string().description(
    "Optional harness agent preset id (e.g. cordis) applied to sessions dispatched from Linear (agent mode).",
  ),
  defaultTeam: Schema.string().description(
    "Fallback team for issue creation when the model omits the team.",
  ),
  defaultProject: Schema.string().description(
    "Fallback project for issue creation when the model omits the project.",
  ),
  writePolicy: Schema.union([Schema.const("ask"), Schema.const("allow"), Schema.const("deny")])
    .default(DEFAULT_WRITE_POLICY)
    .description("Write operations: ask for approval (default), allow, or deny (plan §36)."),
  searchLimit: Schema.natural()
    .min(1)
    .max(50)
    .default(DEFAULT_SEARCH_LIMIT)
    .description("Default page size for issue search; hard max 50 (plan §33)."),
  commentsLimit: Schema.natural()
    .min(1)
    .default(DEFAULT_COMMENTS_LIMIT)
    .description("Default number of comments in the issue context (plan §10.4)."),
});

/** Callbacks driven by the authoritative settings source (mirrors the
 * canonical `installSettingsSection` hooks, plan §26). */
export interface LinearSettingsHooks {
  /**
   * Called with the resolved settings whenever the authoritative source
   * becomes available or changes. The first invocation may be synchronous
   * (settings service already mounted) or asynchronous; later invocations
   * are user-document changes — with `applies: "restart"` the consumer
   * logs them and leaves the running instance untouched.
   */
  onChange(settings: LinearSettings): void;
}

/** Settings suitable for logging: secrets never reach the log (plan §58). */
export function summarizeSettings(settings: LinearSettings): Record<string, unknown> {
  const { oauthClientSecret, ...rest } = settings;
  return {
    ...rest,
    oauthClientSecret: oauthClientSecret ? "***" : undefined,
  };
}

/**
 * Wire the `linear` settings namespace into `ctx.settings`.
 *
 * Two paths:
 *
 * - Fast path — the settings service is already available at plugin start
 *   (the normal profile order): the namespace is registered synchronously and
 *   {@link LinearSettingsHooks.onChange} fires with the resolved settings
 *   (defaults ← patch config ← user document) so the plugin assembles from
 *   user overrides immediately.
 * - Deferred path — no settings service yet: nothing runs now (the caller
 *   assembles from the entry config); when a provider mounts later the
 *   namespace is registered and the resolved settings announced. Later
 *   user-document edits are logged with `applies: "restart"` semantics.
 *
 * Either way the registration rides the plugin's fiber: on plugin unload the
 * namespace and its watchers are removed.
 */
export function installLinearSettings(
  ctx: Context,
  entry: LinearSettings,
  hooks: LinearSettingsHooks,
): void {
  const ns = settingsNamespace(LINEAR_SETTINGS_NAMESPACE);
  const settings = ctx.get("settings");

  if (settings) {
    const scope = settings.register(ns, linearSettingsSchema, {
      base: entry,
      applies: "live",
    });
    announce(ctx, scope, "registered", scope.get() as LinearSettings, hooks);
    return;
  }

  ctx.inject(["settings"], (sctx) => {
    const scope = sctx.settings.register(ns, linearSettingsSchema, {
      base: entry,
      applies: "live",
    });
    announce(sctx, scope, "registered (deferred)", scope.get() as LinearSettings, hooks);
  });
}

function announce(
  ctx: Context,
  scope: {
    get(): unknown;
    watch(callback: (next: unknown, prev: unknown) => void | Promise<void>): () => void;
  },
  verb: string,
  resolved: LinearSettings,
  hooks: LinearSettingsHooks,
): void {
  ctx.logger.info(
    "linear settings %s (namespace=%s, applies=live): %o",
    verb,
    LINEAR_SETTINGS_NAMESPACE,
    summarizeSettings(resolved),
  );
  hooks.onChange(resolved);
  scope.watch((next) => {
    const changed = next as LinearSettings;
    ctx.logger.info(
      "linear settings changed — rebuilding the stack live: %o",
      summarizeSettings(changed),
    );
    hooks.onChange(changed);
  });
}
