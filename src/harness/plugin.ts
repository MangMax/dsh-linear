/**
 * Cordis plugin entry (plan §8).
 *
 * Named exports (`name` / `inject` / `apply`) are the loader convention used
 * by published DSH plugins: the bundle loader imports the package and uses
 * the module namespace as the plugin object. `cordis.patch.yml` mounts this
 * plugin as `id: linear`, `name: 'dsh-linear'`.
 *
 * Composition order (from the plan §8), implemented for Milestones 2–8:
 *   1. create Harness adapters          (M2: SecretStore, ToolRegistrar)
 *   2. create AuthService               (M2: API key path; M5: OAuth provider)
 *   3. create LinearClientFactory       (M2)
 *   4. create domain services           (M2–M3: workspace + issue read path,
 *                                        resolver + team/project/cycle services;
 *                                        M4: issue write path + comment service;
 *                                        M6: connection lifecycle service)
 *   5. register Linear tools            (M2–M3: the eight read tools;
 *                                        M4: create/update issue, add comment)
 *   6. register the write gate          (M4: pipeline-level write policy, §36–§37)
 *   7. register settings (optional)     (M6: `ctx.settings` namespace, §26)
 *   8. register OAuth callback route    (M5: §23 — inside this effect so
 *                                        unload / hot reload never leaks routes)
 *   9. register persistent state        (M7)
 *  10. register Agent Mode (optional)   (M8: §41–§43 — webhook route, session
 *                                        map, harness driver, agent bridge)
 *
 * Settings semantics (M6 §26, live since M7): the `linear` settings namespace
 * is registered with `applies: "live"`. When the settings service is already
 * mounted at plugin start (the normal profile order) the plugin assembles
 * from the resolved settings — defaults ← patch config ← user document —
 * and the assembly itself is deferred to the settings inject callback in
 * that case. Without a settings service (headless profile, §23) assembly
 * uses the patch config directly. Every later user-document edit REBUILDS
 * the stack in place: the auth provider, client factory (cache included),
 * domain services, tools, write gate, web routes and provided services are
 * disposed and re-registered with the new resolved settings — authMode
 * (oauth ⇄ apiKey) and friends switch live, no restart needed.
 *
 * All `ctx.*` access is confined to this file and the adapter modules in
 * `src/harness/*`; business code never touches harness services directly.
 *
 * Lifecycle: the stack lives inside one `ctx.effect`; plugin unload / hot
 * reload disposes whatever stack is current, exactly once.
 */
import { Context } from "@deepseek-ai/cordis";
import { ApiKeyProvider } from "../auth/api-key-provider.ts";
import { LinearOAuthProvider, DEFAULT_OAUTH_SCOPE } from "../auth/oauth-provider.ts";
import type { LinearAuth } from "../auth/auth-service.ts";
import { TokenStore } from "../auth/token-store.ts";
import { HarnessAgentBridge } from "../agent/bridge.ts";
import { CordisAgentDriver } from "../agent/harness-driver.ts";
import { LinearAgentService } from "../agent/linear-agent-service.ts";
import { PersistentAgentSessionMapStore } from "../agent/session-map.ts";
import { WEBHOOK_PATH, createAgentWebhookRoute } from "../agent/webhook.ts";
import { LinearClientFactory } from "../linear/client-factory.ts";
import { LinearMetadataCatalog } from "../linear/resolver/catalog.ts";
import { LinearMetadataResolver } from "../linear/resolver/index.ts";
import { LinearAttachmentService } from "../linear/services/attachment-service.ts";
import { LinearCommentService } from "../linear/services/comment-service.ts";
import {
  LinearDocumentService,
  LinearMilestoneService,
} from "../linear/services/document-service.ts";
import { LinearLabelService } from "../linear/services/label-service.ts";
import { LinearConnectionService } from "../linear/services/connection-service.ts";
import { LinearCycleService } from "../linear/services/cycle-service.ts";
import { LinearIssueService } from "../linear/services/issue-service.ts";
import { LinearProjectService } from "../linear/services/project-service.ts";
import { LinearTeamService } from "../linear/services/team-service.ts";
import {
  LinearCustomerService,
  LinearInitiativeService,
  LinearReleaseService,
} from "../linear/services/enterprise-service.ts";
import { LinearStatusUpdateService } from "../linear/services/status-update-service.ts";
import { LinearUserService } from "../linear/services/user-service.ts";
import { LinearWorkspaceService } from "../linear/services/workspace-service.ts";
import { registerWriteGate } from "../policy/write-gate.ts";
import { createAddCommentTool } from "../tools/add-comment.ts";
import { createCreateAttachmentFromUploadTool } from "../tools/create-attachment-from-upload.ts";
import { createCreateAttachmentTool } from "../tools/create-attachment.ts";
import { createCreateCustomerTool } from "../tools/create-customer.ts";
import { createCreateInitiativeLabelTool } from "../tools/create-initiative-label.ts";
import { createCreateInitiativeTool } from "../tools/create-initiative.ts";
import { createCreateIssueLabelTool } from "../tools/create-issue-label.ts";
import { createCreateMilestoneTool } from "../tools/create-milestone.ts";
import { createDeleteAttachmentTool } from "../tools/delete-attachment.ts";
import { createDeleteCommentTool } from "../tools/delete-comment.ts";
import { createDeleteCustomerNeedTool } from "../tools/delete-customer-need.ts";
import { createDeleteCustomerTool } from "../tools/delete-customer.ts";
import { createDeleteStatusUpdateTool } from "../tools/delete-status-update.ts";
import { createGetIssueStatusTool } from "../tools/get-issue-status.ts";
import { createUpdateCommentTool } from "../tools/update-comment.ts";
import { createUpdateCustomerTool } from "../tools/update-customer.ts";
import { createUpdateMilestoneTool } from "../tools/update-milestone.ts";
import { createUpdateStatusUpdateTool } from "../tools/update-status-update.ts";
import { createHarnessFileReader } from "./file-reader.ts";
import { createCreateReleaseTool } from "../tools/create-release.ts";
import { createGetCustomerTool } from "../tools/get-customer.ts";
import { createGetInitiativeTool } from "../tools/get-initiative.ts";
import { createGetReleaseNoteTool } from "../tools/get-release-note.ts";
import { createGetReleaseTool } from "../tools/get-release.ts";
import { createListCustomersTool } from "../tools/list-customers.ts";
import { createListInitiativeLabelsTool } from "../tools/list-initiative-labels.ts";
import { createListInitiativesTool } from "../tools/list-initiatives.ts";
import { createListReleaseNotesTool } from "../tools/list-release-notes.ts";
import { createListReleasePipelinesTool } from "../tools/list-release-pipelines.ts";
import { createPrepareAttachmentUploadTool } from "../tools/prepare-attachment-upload.ts";
import { createUploadAttachmentFileTool } from "../tools/upload-attachment-file.ts";
import { createListReleasesTool } from "../tools/list-releases.ts";
import { createCreateStatusUpdateTool } from "../tools/create-status-update.ts";
import { createGetDocumentTool } from "../tools/get-document.ts";
import { createGetMilestoneTool } from "../tools/get-milestone.ts";
import { createGetProfileTool } from "../tools/get-profile.ts";
import { createGetStatusUpdateTool } from "../tools/get-status-update.ts";
import { createListDocumentsTool } from "../tools/list-documents.ts";
import { createListMilestonesTool } from "../tools/list-milestones.ts";
import { createListStatusUpdatesTool } from "../tools/list-status-updates.ts";
import { createGetTeamTool } from "../tools/get-team.ts";
import { createGetUserTool } from "../tools/get-user.ts";
import { createListAttachmentsTool } from "../tools/list-attachments.ts";
import { createListCommentsTool } from "../tools/list-comments.ts";
import { createListIssueLabelsTool } from "../tools/list-issue-labels.ts";
import { createListIssueStatusesTool } from "../tools/list-issue-statuses.ts";
import { createListUsersTool } from "../tools/list-users.ts";
import { createConnectionStatusTool } from "../tools/connection-status.ts";
import { createCreateIssueTool } from "../tools/create-issue.ts";
import { createGetIssueContextTool } from "../tools/get-issue-context.ts";
import { createGetIssueTool } from "../tools/get-issue.ts";
import { createGetProjectTool } from "../tools/get-project.ts";
import { createListCyclesTool } from "../tools/list-cycles.ts";
import { createListProjectsTool } from "../tools/list-projects.ts";
import { createListTeamsTool } from "../tools/list-teams.ts";
import { createSearchIssuesTool } from "../tools/search-issues.ts";
import { createUpdateIssueTool } from "../tools/update-issue.ts";
import { HarnessSecretStore } from "./secret-store.ts";
import {
  DEFAULT_ACTOR_MODE,
  DEFAULT_AGENT_MODE,
  DEFAULT_AUTH_MODE,
  DEFAULT_CREDENTIAL_REF,
  DEFAULT_WEBHOOK_SECRET_REF,
  DEFAULT_WRITE_POLICY,
  credentialRefFor,
  type LinearSettings,
} from "./settings.ts";
import { installLinearSettings } from "./settings-ui.ts";
import { HarnessConnectorStateStore, InMemoryConnectorStateStore } from "./storage.ts";
import { HarnessToolRegistrar } from "./tools.ts";
import { registerConnectionApi } from "./connection-api.ts";
import { HarnessWebServer, OAUTH_CALLBACK_PATH, createOAuthCallbackHandler } from "./web.ts";

export const name = "linear";

export const inject = ["tools", "credentials"] as const;

export function apply(ctx: Context, config: Partial<LinearSettings> = {}): void {
  const entry: LinearSettings = {
    ...config,
    authMode: config.authMode ?? DEFAULT_AUTH_MODE,
    actorMode: config.actorMode ?? DEFAULT_ACTOR_MODE,
    writePolicy: config.writePolicy ?? DEFAULT_WRITE_POLICY,
    credentialRef: config.credentialRef ?? DEFAULT_CREDENTIAL_REF,
    agentMode: config.agentMode ?? DEFAULT_AGENT_MODE,
    webhookSecretRef: config.webhookSecretRef ?? DEFAULT_WEBHOOK_SECRET_REF,
  };

  // One effect owns the current stack. `rebuild` swaps it in place when the
  // settings document changes (applies: "live", M7): dispose every
  // registration of the previous stack, then build a fresh one from the new
  // resolved settings. `installLinearSettings` may invoke `onChange`
  // synchronously (settings already available) or asynchronously (provider
  // still starting); the synchronous fallback below guarantees a headless
  // profile still assembles.
  let rebuild: ((settings: LinearSettings) => void) | undefined;
  ctx.effect(() => {
    const logger = ctx.logger("linear");
    let disposers: Array<() => void> = [];

    rebuild = (settings) => {
      for (const dispose of disposers) dispose();
      disposers = [];
      buildStack(ctx, settings, disposers, logger);
    };

    return () => {
      for (const dispose of disposers) dispose();
      disposers = [];
      rebuild = undefined;
    };
  }, "dsh-linear");

  // 7. Settings (M6, §26): register the `linear` namespace (applies: live)
  // and rebuild the stack from the resolved user settings when they change.
  installLinearSettings(ctx, entry, {
    onChange(settings) {
      rebuild?.(settings);
    },
  });

  // Headless / no-settings fallback: assemble from the patch config when the
  // settings inject callback has not run synchronously.
  if (!ctx.get("settings")) {
    rebuild?.(entry);
  }
}

/**
 * Build the whole connector stack from one resolved settings object:
 * adapters → auth (+ OAuth callback route) → client factory → domain
 * services → connection lifecycle (+ browser API routes) → tools → write
 * gate → agent mode. Every registration pushes a disposer into `disposers`;
 * a settings change (live) or plugin unload disposes them all in reverse
 * order, so a rebuild can re-register routes without "duplicate exact route"
 * and tools exactly once.
 */
function buildStack(
  ctx: Context,
  settings: LinearSettings,
  disposers: Array<() => void>,
  logger: ReturnType<Context["logger"]>,
): void {
  // 1. Harness adapters (plan §7).
  const secretStore = new HarnessSecretStore(ctx.credentials);
  const registrar = new HarnessToolRegistrar(ctx.tools);

  // 2. Auth (plan §15–§22). OAuth (M5) is the default; the API-key path
  // (M2) serves local dev / CI / headless profiles / fallback (§16, §23).
  let auth: LinearAuth;
  let oauth: LinearOAuthProvider | undefined;

  // `webServer` is OPTIONAL — `ctx.get()` reads the service store without
  // the inject requirement (direct `ctx.webServer` access throws "cannot
  // get property without inject" when the profile has no web server,
  // verified on the target wave). The adapter serves both the OAuth
  // callback (§23) and the browser connection API (M7 网页授权).
  const webServer = ctx.get("webServer");
  const web = webServer ? new HarnessWebServer(webServer) : undefined;

  // Per-mode credential ref (M7 live switching): one settings field serves
  // both modes — apiKey mode falls back to DSH_LINEAR_API_KEY when the
  // configured ref still names the OAuth default, so flipping authMode live
  // always lands on the right credential.
  const credentialRef = credentialRefFor(settings.authMode, settings.credentialRef);
  if (settings.authMode === "apiKey") {
    auth = new ApiKeyProvider(secretStore, credentialRef);
  } else {
    const provider = new LinearOAuthProvider(
      {
        clientId: settings.oauthClientId ?? "",
        clientSecret: settings.oauthClientSecret,
        redirectUri: settings.redirectUri ?? "",
        actorMode: settings.actorMode ?? DEFAULT_ACTOR_MODE,
        scope: DEFAULT_OAUTH_SCOPE,
      },
      new TokenStore(secretStore, credentialRef),
    );
    auth = provider;
    oauth = settings.oauthClientId && settings.redirectUri ? provider : undefined;

    // Callback route (plan §23): registered here, inside this ctx.effect,
    // so unload / hot reload removes it — otherwise the next start throws
    // "webserver: duplicate exact route" (webServer has no remove-by-path).
    // The flow needs a configured OAuth app; without a web server the UI
    // flow is unavailable but pre-stored bundles and the API-key fallback
    // keep the plugin functional (§23 headless mode).
    if (web && oauth) {
      disposers.push(
        web.registerCallback(OAUTH_CALLBACK_PATH, createOAuthCallbackHandler(provider)),
      );
      const redirectPort = new URL(settings.redirectUri!).port || "(default)";
      if (web.port !== Number(new URL(settings.redirectUri!).port)) {
        logger.warn(
          "OAuth redirectUri port (%s) differs from the web server port (%d); the callback will not be reachable unless they match (plan §23).",
          redirectPort,
          web.port,
        );
      }
    } else if (web && !oauth) {
      logger.warn(
        "OAuth flow is not fully configured: set linear.oauthClientId and linear.redirectUri to enable Connect (plan §23).",
      );
    } else if (oauth) {
      logger.warn(
        "OAuth UI flow unavailable: the profile has no web server. Use linear.authMode = 'apiKey' or add the web server plugin (plan §23).",
      );
    }
  }

  // 3.–4. Client factory + metadata resolver + domain services
  // (plan §28, §30). The factory owns the M7 token-fingerprint client
  // cache (§29) and applies the §34 retry policy to every SDK call;
  // retries are observable at debug level (plan §60). The resolver owns
  // the §14.2 catalog cache shared by every service.
  const factory = new LinearClientFactory(auth, {
    retry: {
      onRetry: (attempt, error, delayMs) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.debug(
          "linear api retry %d after %dms: %s",
          attempt,
          delayMs,
          message.split(/\r?\n/)[0],
        );
      },
    },
  });
  const catalog = new LinearMetadataCatalog(factory);
  const resolver = new LinearMetadataResolver(catalog);
  const workspace = new LinearWorkspaceService(factory, settings.authMode);
  const issues = new LinearIssueService(factory, resolver, {
    searchLimit: settings.searchLimit,
    commentsLimit: settings.commentsLimit,
    defaultTeam: settings.defaultTeam,
    defaultProject: settings.defaultProject,
  });
  const comments = new LinearCommentService(factory, resolver.catalog);
  const users = new LinearUserService(factory, resolver.users);
  const labels = new LinearLabelService(factory, resolver.teams);
  const attachments = new LinearAttachmentService(factory, createHarnessFileReader());
  const documents = new LinearDocumentService(factory);
  const milestones = new LinearMilestoneService(factory, resolver.projects);
  const updates = new LinearStatusUpdateService(factory, resolver.projects, resolver.catalog);
  const initiatives = new LinearInitiativeService(factory);
  const releases = new LinearReleaseService(factory);
  const customers = new LinearCustomerService(factory);

  // M6 connection lifecycle service (plan §50–§52): the state machine
  // behind `linear_connection_status` and the connect / disconnect /
  // reconnect actions, provided to the harness as the `linearConnector`
  // service so a configuration UI / host can drive it (§50).
  const connection = new LinearConnectionService({
    auth,
    oauth,
    factory,
    catalog,
    workspace,
    authMode: settings.authMode,
    actorMode: settings.actorMode,
  });
  disposers.push(ctx.provide("linearConnector", connection));

  // M7 网页授权: same-origin JSON routes driving the connection lifecycle
  // and the settings form for the browser card (Settings → Plugins →
  // Linear Connector). Always registered when a web server exists —
  // status works before OAuth is configured, and connect reports the
  // exact configuration step needed. The settings service is optional
  // (headless); the browser form works through our own routes when it
  // exists (see connection-api.ts for why the official wire cannot
  // serve third-party namespaces on this wave).
  if (web) {
    disposers.push(
      ...registerConnectionApi(
        web,
        connection,
        { oauthConfigured: !!oauth },
        // The real SettingsProvider satisfies the structural subset the
        // routes need (describe with redactSecrets + mutate).
        ctx.get("settings") as never,
      ),
    );
  }

  // 5. Tools (plan §10.1–§10.11): the eight read tools (M2–M3) plus the
  // three write tools (M4). All tools take human semantic names — no
  // Linear internal IDs (M3 acceptance, plan §75).
  const projects = new LinearProjectService(factory, resolver, resolver);
  const teams = new LinearTeamService(factory, resolver);
  const cycles = new LinearCycleService(factory, resolver);
  disposers.push(
    registrar.register(createConnectionStatusTool(connection)),
    registrar.register(createSearchIssuesTool(issues)),
    registrar.register(createGetIssueTool(issues)),
    registrar.register(createGetIssueContextTool(issues)),
    registrar.register(createListProjectsTool(projects)),
    registrar.register(createGetProjectTool(projects)),
    registrar.register(createListTeamsTool(teams)),
    registrar.register(createListCyclesTool(cycles)),
    registrar.register(createCreateIssueTool(issues)),
    registrar.register(createUpdateIssueTool(issues)),
    registrar.register(createAddCommentTool(comments)),
    registrar.register(createListUsersTool(users)),
    registrar.register(createGetUserTool(users)),
    registrar.register(createGetTeamTool(teams)),
    registrar.register(createListIssueStatusesTool(teams)),
    registrar.register(createListIssueLabelsTool(labels)),
    registrar.register(createListCommentsTool(comments)),
    registrar.register(createListAttachmentsTool(attachments)),
    registrar.register(createCreateAttachmentTool(attachments)),
    registrar.register(createPrepareAttachmentUploadTool(attachments)),
    registrar.register(createCreateAttachmentFromUploadTool(attachments)),
    registrar.register(createUploadAttachmentFileTool(attachments)),
    registrar.register(createGetProfileTool(() => workspace.getViewer())),
    registrar.register(createListDocumentsTool(documents)),
    registrar.register(createGetDocumentTool(documents)),
    registrar.register(createListStatusUpdatesTool(updates)),
    registrar.register(createGetStatusUpdateTool(updates)),
    registrar.register(createCreateStatusUpdateTool(updates)),
    registrar.register(createListMilestonesTool(milestones)),
    registrar.register(createGetMilestoneTool(milestones)),
    registrar.register(createListInitiativesTool(initiatives)),
    registrar.register(createGetInitiativeTool(initiatives)),
    registrar.register(createListInitiativeLabelsTool(initiatives)),
    registrar.register(createCreateInitiativeTool(initiatives)),
    registrar.register(createListReleasesTool(releases)),
    registrar.register(createGetReleaseTool(releases)),
    registrar.register(createListReleasePipelinesTool(releases)),
    registrar.register(createListReleaseNotesTool(releases)),
    registrar.register(createGetReleaseNoteTool(releases)),
    registrar.register(createCreateReleaseTool(releases)),
    registrar.register(createListCustomersTool(customers)),
    registrar.register(createGetCustomerTool(customers)),
    registrar.register(createCreateCustomerTool(customers)),
    registrar.register(createDeleteCommentTool(comments)),
    registrar.register(createUpdateCommentTool(comments)),
    registrar.register(createDeleteAttachmentTool(attachments)),
    registrar.register(createDeleteStatusUpdateTool(updates)),
    registrar.register(createUpdateStatusUpdateTool(updates)),
    registrar.register(createDeleteCustomerTool(customers)),
    registrar.register(createDeleteCustomerNeedTool(customers)),
    registrar.register(createUpdateCustomerTool(customers)),
    registrar.register(createCreateIssueLabelTool(labels)),
    registrar.register(createCreateInitiativeLabelTool(initiatives)),
    registrar.register(createCreateMilestoneTool(milestones)),
    registrar.register(createUpdateMilestoneTool(milestones)),
    registrar.register(createGetIssueStatusTool(teams)),
  );

  // 6. Pipeline-level write gate (plan §36–§37): reads pass automatically,
  // writes are `ask` by default and resolved through the deployment's
  // approval service (`ctx.approval`); `allow` / `deny` override.
  disposers.push(registerWriteGate(ctx, settings.writePolicy));

  // 8. Milestone 8 — Linear Agent Mode (plan §41–§43). Everything lives in
  // `src/agent/*` so the Developer-Preview Agent API can never pollute the
  // base connector. Composition: persistent session map (§42, storageDomain
  // when mounted, in-memory otherwise) + Linear Agent API service + the
  // harness session driver (`ctx.agents`, optional) + the bridge that ties
  // AgentSessionEvent webhooks to harness sessions and mirrors
  // user-comprehensible activities back (§43). The webhook route is
  // registered only when the store is ready (lifecycle: same effect).
  const agentLogger = ctx.logger("linear.agent");
  const storageDomain = ctx.get("storageDomain") as never;
  const stateStore = storageDomain
    ? new HarnessConnectorStateStore(storageDomain as never)
    : new InMemoryConnectorStateStore();
  const stateReady =
    stateStore instanceof HarnessConnectorStateStore
      ? stateStore.open().catch((err: unknown) => {
          agentLogger.warn("state domain open failed, falling back to memory: %s", messageOf(err));
        })
      : Promise.resolve();
  const agentMap = new PersistentAgentSessionMapStore(stateStore);
  const linearAgent = new LinearAgentService(factory);
  // The driver's sink routes through the bridge; `bridge` is assigned
  // below and only invoked asynchronously, after construction completes.
  let bridge: HarnessAgentBridge;
  const driver = ctx.get("agents")
    ? new CordisAgentDriver(ctx, (harnessSessionId, activity) =>
        bridge.mirror(harnessSessionId, activity),
      )
    : undefined;
  bridge = new HarnessAgentBridge({
    map: agentMap,
    linear: linearAgent,
    driver,
    sessionIdPrefix: "linear-",
    provider: settings.agentProvider,
    model: settings.agentModel,
    agentPreset: settings.agentPreset,
    logger: agentLogger,
  });
  disposers.push(ctx.provide("linearAgent", bridge));

  if (settings.agentMode) {
    if (settings.authMode !== "oauth" || settings.actorMode !== "app") {
      agentLogger.warn(
        "agent mode requires authMode=oauth and actorMode=app (an app-user OAuth app); the agent bridge is inactive until both are set.",
      );
    }
    if (!oauth) {
      agentLogger.warn(
        "agent mode needs a configured OAuth app (linear.oauthClientId + linear.redirectUri); the webhook route is not registered.",
      );
    }
    if (!web) {
      agentLogger.warn(
        "agent mode needs the web server to receive Linear webhooks; this profile has none (plan §40).",
      );
    }
    if (!driver) {
      agentLogger.warn(
        "agent mode needs the harness agent registry (`agents`); incoming sessions cannot be dispatched.",
      );
    }
    if (web && oauth) {
      // Register after the state store is ready so the very first webhook
      // already finds a writable session map; `disposed` keeps the route
      // from leaking when the plugin unloads mid-open.
      let disposed = false;
      disposers.push(() => {
        disposed = true;
      });
      void stateReady.then(() => {
        if (disposed) return;
        disposers.push(
          web.registerCallback(
            WEBHOOK_PATH,
            createAgentWebhookRoute({
              secretStore,
              webhookSecretRef: settings.webhookSecretRef ?? DEFAULT_WEBHOOK_SECRET_REF,
              bridge,
              logger: agentLogger,
            }),
          ),
        );
        agentLogger.info(
          "linear.agent webhook route %s registered (secret ref=%s).",
          WEBHOOK_PATH,
          settings.webhookSecretRef ?? DEFAULT_WEBHOOK_SECRET_REF,
        );
      });
    }
  }

  logger.info(
    "dsh-linear loaded (authMode=%s, credentialRef=%s, writePolicy=%s, agentMode=%s, tools=%d)",
    settings.authMode,
    settings.credentialRef,
    settings.writePolicy,
    settings.agentMode,
    disposers.length,
  );
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message.split(/\r?\n/)[0] || String(err) : String(err);
}
