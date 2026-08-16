# tests/contract

Linear contract tests (plan §53.2).

Mock the boundary at the **Linear client** (not the tool layer): SDK model →
canonical DTO mapping, GraphQL error → `LinearConnectorError` normalization,
pagination cursor mapping, resolver ambiguity, create/update payload mapping.

Status: **implemented for the Milestone 2–3 read path** (plan §75):

- `workspace-service.test.ts` — organization / viewer / connection-status
  mapping, never-throws disconnected status, SDK error normalization.
- `issue-service.test.ts` — getIssue (identifier / URL / NOT_FOUND /
  VALIDATION_ERROR / SDK errors), getIssueContext (comments via the cached
  users catalog, commentsLimit clamping), searchIssues (name → ID resolution
  through the resolver stub, ID-based filter pushdown for team / project /
  assignee / status(+team), name-based fallbacks for status-without-team and
  cycles, AMBIGUOUS_REFERENCE / NOT_FOUND surfaced before querying, term vs
  filter paths, pagination cursors, limit clamping), buildIssueFilter shapes.
- `team-service.test.ts` — listTeams mapping, pagination, SDK errors.
- `project-service.test.ts` — listProjects (resolved-team accessibleTeams
  filter, status name + containsIgnoreCase pushdown, pagination, ambiguity),
  getProject (name / ID / URL references, NOT_FOUND, recent-updates cap 5,
  progress 0..100 clamping, eager/promise-backed nested models).
- `cycle-service.test.ts` — listCycles (team resolution → CycleFilter.team,
  date mapping, pagination, ambiguity, SDK errors).
- `error-normalization.test.ts` — every `LinearError` type and status maps
  to the stable `LinearConnectorError` code; messages are sanitized to a
  single line and truncated; passthrough for already-normalized errors.

Fake SDK models are plain structural objects (see `src/linear/services/`
mapper views), so an `@linear/sdk` upgrade only touches this layer (plan §64).
