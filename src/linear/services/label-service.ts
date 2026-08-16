/**
 * Issue label domain service (plan §14.2 surface expansion).
 *
 * Lists the workspace's issue labels, optionally narrowed to one team
 * (semantic team name resolved through the TeamResolver, §14.1).
 */
import type { IssueLabelSummary } from "../../model/people.ts";
import { normalizeLimit, type PagedResult } from "../../model/pagination.ts";
import { toPagedResult } from "../pagination.ts";
import { LinearConnectorError, normalizeLinearError } from "../error.ts";
import type { LinearClientFactoryLike } from "../client-factory.ts";
import type { TeamResolver } from "../resolver/team.ts";

/** Minimal structural view of the SDK IssueLabel connection row (plan §64). */
export interface SdkLabelViewLike {
  id: string;
  name: string;
  color?: string | null;
  isGroup?: boolean;
}

export interface LabelService {
  listIssueLabels(options?: {
    team?: string;
    limit?: number;
    cursor?: string;
  }): Promise<PagedResult<IssueLabelSummary>>;
  /** Codex parity: create an issue label (write-gated). */
  createIssueLabel(
    name: string,
    options?: { color?: string; team?: string },
  ): Promise<IssueLabelSummary>;
}

export class LinearLabelService implements LabelService {
  constructor(
    private readonly factory: LinearClientFactoryLike,
    private readonly teams: TeamResolver,
  ) {}

  async listIssueLabels(
    options: {
      team?: string;
      limit?: number;
      cursor?: string;
    } = {},
  ): Promise<PagedResult<IssueLabelSummary>> {
    const limit = normalizeLimit(options.limit);
    try {
      const client = (await this.factory.create()) as unknown as {
        issueLabels(variables: Record<string, unknown>): Promise<{
          nodes: SdkLabelViewLike[];
          pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
        }>;
      };
      const filter: Record<string, unknown> = {};
      if (options.team?.trim()) {
        const team = await this.teams.resolveTeam(options.team.trim());
        filter.team = { id: { eq: team.id } };
      }
      const connection = await client.issueLabels({
        ...(Object.keys(filter).length > 0 ? { filter } : {}),
        first: limit,
        after: options.cursor ?? undefined,
      });
      return toPagedResult(
        connection.nodes.map((label) => ({
          id: label.id,
          name: label.name,
          ...(label.color ? { color: label.color } : {}),
          ...(label.isGroup !== undefined ? { isGroup: label.isGroup } : {}),
        })),
        connection.pageInfo,
      );
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async createIssueLabel(
    name: string,
    options: { color?: string; team?: string } = {},
  ): Promise<IssueLabelSummary> {
    const trimmed = name?.trim();
    if (!trimmed) {
      throw LinearConnectorError.validation("label name must not be empty.");
    }
    try {
      const client = (await this.factory.create()) as unknown as {
        createIssueLabel(input: Record<string, unknown>): Promise<{ issueLabel?: unknown }>;
      };
      const input: Record<string, unknown> = { name: trimmed };
      if (options.color?.trim()) input.color = options.color.trim();
      if (options.team?.trim()) {
        const team = await this.teams.resolveTeam(options.team.trim());
        input.teamId = team.id;
      }
      const result = await client.createIssueLabel(input);
      if (!result?.issueLabel) {
        throw LinearConnectorError.validation("Linear did not return the created issue label.");
      }
      const label = (await Promise.resolve(result.issueLabel)) as SdkLabelViewLike;
      return {
        id: label.id,
        name: label.name,
        ...(label.color ? { color: label.color } : {}),
        ...(label.isGroup !== undefined ? { isGroup: label.isGroup } : {}),
      };
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }
}
