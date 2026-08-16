/**
 * `linear_search_issues` (plan §10.2, §32, §33).
 *
 * Default `limit` 20, hard max 50. Filters are pushed down to Linear native
 * conditions whenever possible — never download-then-filter.
 */
import type { ToolSpec } from "./types.ts";

export const searchIssuesTool: ToolSpec = {
  name: "linear_search_issues",
  description:
    "Search Linear issues by text, team, project, status, assignee, priority, labels, or cycle. Returns a paged result.",
  parameters: {
    query: { type: "string", description: "Free-text search across title and description." },
    team: { type: "string", description: 'Team name or key, e.g. "Engineering" or "ENG".' },
    project: { type: "string", description: 'Project name, e.g. "Backend".' },
    status: { type: "string", description: 'Workflow status name, e.g. "In Progress".' },
    assignee: { type: "string", description: "Assignee name or email." },
    priority: {
      type: "string",
      enum: ["urgent", "high", "medium", "low", "none"],
      description: "Priority filter.",
    },
    labels: {
      type: "array",
      items: { type: "string" },
      description: "Label names; all must match.",
    },
    cycle: { type: "string", description: "Cycle name." },
    includeCompleted: {
      type: "boolean",
      description: "Include completed issues (default false).",
    },
    limit: { type: "number", description: "Max results, default 20, hard cap 50." },
    cursor: { type: "string", description: "Pagination cursor from a previous result." },
  },
};

import {
  toToolDefinition,
  optionalBoolean,
  optionalEnum,
  optionalNumber,
  optionalString,
  optionalStringArray,
} from "./define.ts";
import { searchIssuesResultSchema } from "./schemas.ts";
import { renderSearchResult } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { PriorityInput } from "../model/issue.ts";
import type { IssueReadService, SearchIssuesQuery } from "../linear/services/issue-service.ts";

const PRIORITY_VALUES: readonly PriorityInput[] = ["urgent", "high", "medium", "low", "none"];

/** Registry-ready definition bound to an issue service (plan §10.2, §32). */
export function createSearchIssuesTool(issues: IssueReadService): ToolDefinition {
  return toToolDefinition(searchIssuesTool, searchIssuesResultSchema, {
    async execute(args) {
      const a = args as Record<string, unknown>;
      const query: SearchIssuesQuery = {
        query: optionalString(a.query),
        team: optionalString(a.team),
        project: optionalString(a.project),
        status: optionalString(a.status),
        assignee: optionalString(a.assignee),
        priority: optionalEnum(a.priority, PRIORITY_VALUES),
        labels: optionalStringArray(a.labels),
        cycle: optionalString(a.cycle),
        includeCompleted: optionalBoolean(a.includeCompleted),
        limit: optionalNumber(a.limit),
        cursor: optionalString(a.cursor),
      };
      return issues.searchIssues(query);
    },
    render(value) {
      return renderSearchResult(value);
    },
  });
}
