/**
 * `linear_get_issue` (plan §10.3).
 *
 * Accepts `ENG-123`, `eng-123`, a Linear issue URL, or an issue UUID
 * (resolved by the IssueReferenceResolver in the domain layer, §31).
 */
import type { ToolSpec } from "./types.ts";

export const getIssueTool: ToolSpec = {
  name: "linear_get_issue",
  description:
    "Get a Linear issue by identifier (ENG-123), URL, or UUID. Returns a compact issue summary.",
  parameters: {
    issue: {
      type: "string",
      required: true,
      description: "Linear issue identifier such as ENG-123, or an issue URL.",
    },
  },
};

import { toToolDefinition } from "./define.ts";
import { issueDetailSchema } from "./schemas.ts";
import { renderGetIssue } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { IssueReadService } from "../linear/services/issue-service.ts";

/** Registry-ready definition bound to an issue service (plan §10.3, §31). */
export function createGetIssueTool(issues: IssueReadService): ToolDefinition {
  return toToolDefinition(getIssueTool, issueDetailSchema, {
    async execute(args) {
      const a = args as { issue?: unknown };
      return issues.getIssue(typeof a.issue === "string" ? a.issue : "");
    },
    render(value) {
      return renderGetIssue(value);
    },
  });
}
