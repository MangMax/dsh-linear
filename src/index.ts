/**
 * dsh-linear — DeepSeek Harness native Linear connector (plan §1, §77).
 *
 * This module is the npm package entry. The DSH bundle loader imports the
 * package and uses the exported Cordis plugin (`name` / `inject` / `apply`)
 * — see `cordis.patch.yml` and `src/harness/plugin.ts`.
 *
 * Everything else exported here is the stable public surface: canonical
 * models, settings, errors, tool catalog, Milestone 2 read-path services,
 * and the Phase-2 agent contracts.
 */

// Cordis plugin entry (mounted by cordis.patch.yml).
export { apply, inject, name } from "./harness/plugin.ts";

// Canonical models (plan §12, §33, §10.1, §52).
export * from "./model/connection.ts";
export * from "./model/issue.ts";
export * from "./model/pagination.ts";
export * from "./model/project.ts";

// Harness compatibility adapters (plan §7).
export type { ConnectorSettings, LinearSettings } from "./harness/settings.ts";
export {
  DEFAULT_ACTOR_MODE,
  DEFAULT_AUTH_MODE,
  DEFAULT_COMMENTS_LIMIT,
  DEFAULT_SEARCH_LIMIT,
  DEFAULT_WRITE_POLICY,
} from "./harness/settings.ts";
export type { ConnectorStateStore } from "./harness/storage.ts";
export type { SecretStore } from "./harness/credentials.ts";
export { HarnessSecretStore } from "./harness/secret-store.ts";
export type { CredentialProviderLike } from "./harness/secret-store.ts";
export type { ToolRegistrar } from "./harness/tools.ts";
export type { WebRouteRegistrar, WebServerLike } from "./harness/web.ts";
export {
  HarnessWebServer,
  OAUTH_CALLBACK_PATH,
  createOAuthCallbackHandler,
} from "./harness/web.ts";

// Error normalization (plan §35).
export { LinearConnectorError, normalizeLinearError } from "./linear/error.ts";
export type { LinearConnectorErrorCode } from "./linear/error.ts";

// Auth contracts (plan §15–§22).
export type { LinearAuth, ResolvedLinearAuth } from "./auth/auth-service.ts";
export type { OAuthProvider, OAuthProviderOptions } from "./auth/oauth-provider.ts";
export {
  LINEAR_AUTHORIZE_ENDPOINT,
  LINEAR_REVOKE_ENDPOINT,
  LINEAR_TOKEN_ENDPOINT,
  LinearOAuthProvider,
  DEFAULT_OAUTH_SCOPE,
  OAUTH_REFRESH_THRESHOLD_MS,
} from "./auth/oauth-provider.ts";
export type { LinearOAuthTokenBundle } from "./auth/token-store.ts";
export { TokenStore } from "./auth/token-store.ts";
export { InMemoryOAuthStateStore, OAUTH_STATE_TTL_MS } from "./auth/oauth-state.ts";
export type { PendingOAuthState } from "./auth/oauth-state.ts";
export { RefreshCoordinator } from "./auth/token-refresh.ts";
export type { TokenRefresher } from "./auth/token-refresh.ts";
export { ApiKeyProvider } from "./auth/api-key-provider.ts";

// Issue references (plan §31).
export { parseIssueReference } from "./linear/issue-reference.ts";
export type { IssueReference } from "./linear/issue-reference.ts";

// Metadata resolver (plan §14): match priority §14.1 + 5-min catalog cache §14.2.
export { LinearMetadataCatalog, METADATA_CACHE_TTL_MS } from "./linear/resolver/catalog.ts";
export { LinearMetadataResolver } from "./linear/resolver/index.ts";
export { LinearProjectResolver, parseProjectReference } from "./linear/resolver/project.ts";
export type { ProjectReference } from "./linear/resolver/project.ts";
export { LinearTeamResolver } from "./linear/resolver/team.ts";
export { LinearWorkflowStateResolver } from "./linear/resolver/state.ts";
export { LinearUserResolver } from "./linear/resolver/user.ts";
export { LinearLabelResolver } from "./linear/resolver/label.ts";
export { matchByName, normalizeName } from "./linear/resolver/matching.ts";
export type { IdentityField, MatchableBase } from "./linear/resolver/matching.ts";

// Connection lifecycle service (plan §50–§52; Milestone 6): the §50 state
// machine plus connect / disconnect / reconnect, provided as the
// `linearConnector` harness service.
export {
  LinearConnectionService,
  type LinearConnectionServiceLike,
  type LinearConnectionServiceOptions,
  type LinearConnectResult,
  type CatalogClearable,
} from "./linear/services/connection-service.ts";

// Settings registration (plan §26; Milestone 6).
export {
  LINEAR_SETTINGS_NAMESPACE,
  installLinearSettings,
  linearSettingsSchema,
  summarizeSettings,
  type LinearSettingsHooks,
} from "./harness/settings-ui.ts";

// Domain service seams (plan §30) and the Milestone 2–3 read implementations.
export type {
  IssueService,
  IssueReadService,
  IssueServiceOptions,
  IssueMetadata,
  IssueCatalogSource,
  ResolvedSearchQuery,
  SearchIssuesQuery,
  CreateIssueCommand,
  UpdateIssueCommand,
} from "./linear/services/issue-service.ts";
export { LinearIssueService, validateDueDate } from "./linear/services/issue-service.ts";
export type { CommentService, AddCommentInput } from "./linear/services/comment-service.ts";
export { LinearAttachmentService } from "./linear/services/attachment-service.ts";
export { LinearCommentService } from "./linear/services/comment-service.ts";
export {
  LinearDocumentService,
  LinearMilestoneService,
} from "./linear/services/document-service.ts";
export { LinearLabelService } from "./linear/services/label-service.ts";
export type {
  ProjectService,
  ListProjectsQuery,
  ProjectServiceOptions,
} from "./linear/services/project-service.ts";
export {
  LinearProjectService,
  mapProjectSummary,
  mapProjectDetail,
} from "./linear/services/project-service.ts";
export type { TeamService, TeamSummary, ListTeamsOptions } from "./linear/services/team-service.ts";
export { LinearTeamService } from "./linear/services/team-service.ts";
export {
  LinearCustomerService,
  LinearInitiativeService,
  LinearReleaseService,
} from "./linear/services/enterprise-service.ts";
export { LinearStatusUpdateService } from "./linear/services/status-update-service.ts";
export { LinearUserService } from "./linear/services/user-service.ts";
export type { CycleServiceOptions } from "./linear/services/cycle-service.ts";
export { LinearCycleService } from "./linear/services/cycle-service.ts";
export type {
  LinearSdkModel,
  SdkIssueCreateInput,
  SdkIssueUpdateInput,
  SdkCommentCreateInput,
  SdkIssueViewLike,
  SdkConnection,
  SdkPageInfo,
} from "./linear/sdk-model.ts";
export type {
  CycleService,
  CycleSummary,
  ListCyclesQuery,
} from "./linear/services/cycle-service.ts";
export type {
  WorkspaceService,
  ConnectionStatusService,
} from "./linear/services/workspace-service.ts";
export { LinearWorkspaceService } from "./linear/services/workspace-service.ts";

// DTO mapping (plan §12) — structural SDK views for tests and embedders.
export {
  indexById,
  mapComment,
  mapIssueDetail,
  mapIssueSummary,
  type IssueSummaryCatalogs,
  type SdkIssueView,
} from "./linear/services/issue-mapper.ts";

// Client factory (plan §28).
export { LinearClientFactory } from "./linear/client-factory.ts";
export type { LinearClientFactoryLike } from "./linear/client-factory.ts";

// Metadata resolver contracts (plan §14).
export type { MetadataResolver } from "./linear/resolver/index.ts";
export type { LabelRef, LabelResolver } from "./linear/resolver/label.ts";
export type { ProjectRef, ProjectResolver } from "./linear/resolver/project.ts";
export type { TeamRef, TeamResolver } from "./linear/resolver/team.ts";
export type { UserRef, UserResolver } from "./linear/resolver/user.ts";
export type { WorkflowStateRef, WorkflowStateResolver } from "./linear/resolver/state.ts";

// Tool catalog (plan §10) and registry-ready definitions (read M2–M3,
// write M4).
export { linearTools } from "./tools/index.ts";
export type { ToolParameterSpec, ToolSpec } from "./tools/types.ts";
export {
  createAddCommentTool,
  createConnectionStatusTool,
  createCreateIssueTool,
  createGetIssueContextTool,
  createGetIssueTool,
  createGetProjectTool,
  createListCyclesTool,
  createListProjectsTool,
  createListTeamsTool,
  createSearchIssuesTool,
  createUpdateIssueTool,
} from "./tools/index.ts";

// Write policy (plan §36) and the pipeline-level gate (plan §37).
export {
  WRITE_TOOL_NAMES,
  READ_TOOL_NAMES,
  evaluateWritePolicy,
  isReadTool,
  isWriteTool,
} from "./policy/write-policy.ts";
export type { WriteDecision } from "./policy/write-policy.ts";
export { registerWriteGate, writeGateDecision } from "./policy/write-gate.ts";
export type { WriteGateDecision } from "./policy/write-gate.ts";

// Phase 2 agent contracts (plan §41–§43; Milestone 8).
export type { LinearAgentBridge, AgentSessionEventLike } from "./agent/bridge.ts";
export { HarnessAgentBridge } from "./agent/bridge.ts";
export type { BridgeLogger, AgentBridgeOptions } from "./agent/bridge.ts";
export { WEBHOOK_PATH, WEBHOOK_SECRET_REF, AGENT_SESSION_EVENT_TYPE } from "./agent/webhook.ts";
export type { AgentSessionMap, AgentSessionMapStore } from "./agent/session-map.ts";
export {
  PersistentAgentSessionMapStore,
  InMemoryAgentSessionMapStore,
} from "./agent/session-map.ts";
export type { AgentActivity, AgentActivityKind, LinearActivityContent } from "./agent/activity.ts";
export {
  MAX_ACTIVITY_SUMMARY_CHARS,
  clampSummary,
  createAgentActivity,
  ephemeralAllowed,
  toLinearActivityContent,
} from "./agent/activity.ts";
export type {
  HarnessRun,
  HarnessSessionDriver,
  DriverSessionOptions,
} from "./agent/harness-driver.ts";
export {
  CordisAgentDriver,
  finalAssistantText,
  isAgentLive,
  summarizeToolArguments,
  toolActionLabel,
} from "./agent/harness-driver.ts";
export { LinearAgentService } from "./agent/linear-agent-service.ts";
export type {
  LinearAgentServiceLike,
  LinearAgentClientLike,
} from "./agent/linear-agent-service.ts";
export {
  HarnessConnectorStateStore,
  InMemoryConnectorStateStore,
  STATE_DOMAIN_NAME,
  STATE_DOMAIN_SPEC,
} from "./harness/storage.ts";
