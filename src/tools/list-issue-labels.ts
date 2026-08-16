/**
 * `linear_list_issue_labels` (v0.2 tool batch).
 *
 * Workspace (or team-scoped) issue labels — the names `labels` arguments
 * accept (plan §14.2 labels catalog surfaced as a tool).
 */
import type { ToolSpec } from "./types.ts";

export const listIssueLabelsTool: ToolSpec = {
  name: "linear_list_issue_labels",
  description: "List Linear issue labels in the workspace, optionally for one team.",
  parameters: {
    team: { type: "string", description: "Team name, key (e.g. ENG), or ID." },
    limit: { type: "number", description: "Max results, default 20, hard cap 50." },
    cursor: { type: "string", description: "Pagination cursor from a previous result." },
  },
};

import { toToolDefinition, optionalNumber, optionalString } from "./define.ts";
import { issueLabelListResultSchema } from "./schemas.ts";
import { renderIssueLabelList } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { LabelService } from "../linear/services/label-service.ts";

/** Registry-ready definition bound to a label service. */
export function createListIssueLabelsTool(labels: LabelService): ToolDefinition {
  return toToolDefinition(listIssueLabelsTool, issueLabelListResultSchema, {
    async execute(args) {
      const a = args as { team?: unknown; limit?: unknown; cursor?: unknown };
      return labels.listIssueLabels({
        team: optionalString(a.team),
        limit: optionalNumber(a.limit),
        cursor: optionalString(a.cursor),
      });
    },
    render(value) {
      return renderIssueLabelList(value);
    },
  });
}
