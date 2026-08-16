/**
 * `linear_get_issue_context` (plan §10.4).
 *
 * The most important tool for agent UX: one call aggregates the issue,
 * status, priority, assignee, team, project, cycle, labels, relations and
 * recent comments — so the agent never chains five separate calls.
 */
import type { ToolSpec } from "./types.ts";

export const getIssueContextTool: ToolSpec = {
  name: "linear_get_issue_context",
  description:
    "Get a Linear issue with its full context in one call: status, priority, assignee, team, project, cycle, labels, relations, and recent comments.",
  parameters: {
    issue: {
      type: "string",
      required: true,
      description: "Linear issue identifier such as ENG-123, or an issue URL.",
    },
    commentsLimit: {
      type: "number",
      description: "Max recent comments to include, default 20.",
    },
  },
};

import { toToolDefinition, optionalNumber } from "./define.ts";
import { issueContextSchema } from "./schemas.ts";
import { renderIssueContext } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { IssueReadService } from "../linear/services/issue-service.ts";

/** Registry-ready definition bound to an issue service (plan §10.4). */
export function createGetIssueContextTool(issues: IssueReadService): ToolDefinition {
  return toToolDefinition(getIssueContextTool, issueContextSchema, {
    async execute(args) {
      const a = args as { issue?: unknown; commentsLimit?: unknown };
      return issues.getIssueContext(typeof a.issue === "string" ? a.issue : "", {
        commentsLimit: optionalNumber(a.commentsLimit),
      });
    },
    render(value) {
      return renderIssueContext(value);
    },
  });
}
