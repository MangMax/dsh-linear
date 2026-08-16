/**
 * Team domain service (plan §10.10; v0.2 expansion: getTeam +
 * listWorkflowStates).
 *
 * {@link LinearTeamService} is the M3 implementation over
 * {@link LinearClientFactoryLike}: the workspace teams connection, paged and
 * mapped to the canonical TeamSummary. The v0.2 tool batch adds team details
 * (semantic name/key/ID → TeamDetail) and the team's workflow states —
 * the same states catalog the resolver caches (§14.2), surfaced as a tool.
 */
import { normalizeLimit, type PagedResult } from "../../model/pagination.ts";
import type { TeamDetail, WorkflowStateSummary } from "../../model/people.ts";
import { toPagedResult } from "../pagination.ts";
import { LinearConnectorError, normalizeLinearError } from "../error.ts";
import type { LinearClientFactoryLike } from "../client-factory.ts";
import type { LinearSdkModel } from "../sdk-model.ts";
import { type TeamRef, type TeamResolver } from "../resolver/team.ts";

export type TeamSummary = TeamRef;

export interface ListTeamsOptions {
  /** Page size, clamped to [1, 50]; default 20. */
  limit?: number;
  /** Pagination cursor from a previous result. */
  cursor?: string;
}

export interface TeamService {
  listTeams(options?: ListTeamsOptions): Promise<PagedResult<TeamSummary>>;
  /** `ref` is a team name, key, or ID. */
  getTeam(ref: string): Promise<TeamDetail>;
  /** Workflow states of one team (name / key / ID), paged. */
  listWorkflowStates(
    team: string,
    options?: { limit?: number; cursor?: string },
  ): Promise<PagedResult<WorkflowStateSummary>>;
  /** One workflow state by name or ID within a team (Codex get_issue_status). */
  getWorkflowState(team: string, state: string): Promise<WorkflowStateSummary>;
}

/** Structural view of the SDK Team model surface used here (plan §64). */
export interface SdkTeamDetailView {
  id: string;
  key: string;
  name: string;
  displayName?: string;
  issueCount?: number;
  timezone?: string;
  cyclesEnabled?: boolean;
  triageEnabled?: boolean;
  states(variables: { first: number; after?: string }): Promise<{
    nodes: WorkflowStateSummary[];
    pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
  }>;
}

export class LinearTeamService implements TeamService {
  constructor(
    private readonly factory: LinearClientFactoryLike,
    private readonly teams: TeamResolver,
  ) {}

  async listTeams(options: ListTeamsOptions = {}): Promise<PagedResult<TeamSummary>> {
    const limit = normalizeLimit(options.limit);
    try {
      const client = (await this.factory.create()) as unknown as LinearSdkModel;
      const connection = await client.teams({ first: limit, after: options.cursor ?? undefined });
      const items: TeamSummary[] = connection.nodes.map((team) => ({
        id: team.id,
        key: team.key,
        name: team.name,
      }));
      return toPagedResult(items, connection.pageInfo);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async getTeam(ref: string): Promise<TeamDetail> {
    try {
      const client = (await this.factory.create()) as unknown as {
        team(id: string): Promise<SdkTeamDetailView | undefined>;
      };
      const resolved = await this.teams.resolveTeam(ref);
      const team = await client.team(resolved.id);
      if (!team) {
        throw LinearConnectorError.notFound("team", ref);
      }
      return {
        id: team.id,
        key: team.key,
        name: team.name,
        ...(team.displayName && team.displayName !== team.name
          ? { displayName: team.displayName }
          : {}),
        ...(team.issueCount !== undefined ? { issueCount: team.issueCount } : {}),
        ...(team.timezone ? { timezone: team.timezone } : {}),
        ...(team.cyclesEnabled !== undefined ? { cyclesEnabled: team.cyclesEnabled } : {}),
        ...(team.triageEnabled !== undefined ? { triageEnabled: team.triageEnabled } : {}),
      };
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async listWorkflowStates(
    team: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<PagedResult<WorkflowStateSummary>> {
    const limit = normalizeLimit(options.limit);
    try {
      const client = (await this.factory.create()) as unknown as {
        team(id: string): Promise<SdkTeamDetailView | undefined>;
      };
      const resolved = await this.teams.resolveTeam(team);
      const teamModel = await client.team(resolved.id);
      if (!teamModel) {
        throw LinearConnectorError.notFound("team", team);
      }
      const connection = await teamModel.states({
        first: limit,
        after: options.cursor ?? undefined,
      });
      // The SDK returns WorkflowState model instances (class prototypes with
      // lazy getters) — the lossless-JSON pipeline rejects them, so map to
      // plain canonical objects explicitly (surfaced by the real run).
      const items: WorkflowStateSummary[] = connection.nodes.map((state) => ({
        id: state.id,
        name: state.name,
        type: state.type,
        ...(state.color ? { color: state.color } : {}),
        ...(state.position !== undefined ? { position: state.position } : {}),
      }));
      return toPagedResult(items, connection.pageInfo);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async getWorkflowState(team: string, state: string): Promise<WorkflowStateSummary> {
    const stateName = state?.trim();
    if (!stateName) {
      throw LinearConnectorError.validation("status name must not be empty.");
    }
    // IDs resolve directly; names scan the team states (bounded, §14.2).
    if (/^[0-9a-f-]{36}$/i.test(stateName)) {
      const resolved = await this.teams.resolveTeam(team);
      const client = (await this.factory.create()) as unknown as {
        workflowState?(id: string): Promise<WorkflowStateSummary | undefined>;
        team(id: string): Promise<SdkTeamDetailView | undefined>;
      };
      if (client.workflowState) {
        const found = await client.workflowState(stateName);
        if (found) return found;
      }
      const teamModel = await client.team(resolved.id);
      if (!teamModel) {
        throw LinearConnectorError.notFound("team", team);
      }
      const all = await teamModel.states({ first: 200 });
      const byId = all.nodes.find((candidate) => candidate.id === stateName);
      if (byId) return byId;
      throw LinearConnectorError.notFound("workflow state", stateName);
    }
    const result = await this.listWorkflowStates(team, { limit: 50 });
    const exact = result.items.find(
      (candidate) =>
        candidate.name === stateName || candidate.name.toLowerCase() === stateName.toLowerCase(),
    );
    if (!exact) {
      throw LinearConnectorError.notFound("workflow state", stateName);
    }
    return exact;
  }
}
