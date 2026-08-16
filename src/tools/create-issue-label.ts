/**
 * `linear_create_issue_label` (Codex parity — WRITE).
 */
import type { ToolSpec } from "./types.ts";

export const createIssueLabelTool: ToolSpec = {
  name: "linear_create_issue_label",
  description: "Create a new Linear issue label.",
  parameters: {
    name: { type: "string", description: "Label name.", required: true },
    color: { type: "string", description: "Hex color, e.g. #ff0000." },
    team: { type: "string", description: "Team name or key to scope the label." },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { issueLabelProperty } from "./schemas.ts";
import { renderIssueLabelList } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { LabelService } from "../linear/services/label-service.ts";

/** Registry-ready definition bound to the label service. */
export function createCreateIssueLabelTool(service: LabelService): ToolDefinition {
  return toToolDefinition(createIssueLabelTool, issueLabelProperty, {
    async execute(args) {
      const a = args as { name?: unknown; color?: unknown; team?: unknown };
      return service.createIssueLabel(optionalString(a.name) ?? "", {
        color: optionalString(a.color),
        team: optionalString(a.team),
      });
    },
    render(value) {
      return renderIssueLabelList({ items: [value as never], hasMore: false } as never);
    },
  });
}
