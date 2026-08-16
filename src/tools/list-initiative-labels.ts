/**
 * `linear_list_initiative_labels` (v0.2 continuation).
 */
import type { ToolSpec } from "./types.ts";

export const listInitiativeLabelsTool: ToolSpec = {
  name: "linear_list_initiative_labels",
  description: "List initiative labels in the workspace.",
  parameters: {
    limit: { type: "number", description: "Max results, default 20, hard cap 50." },
    cursor: { type: "string", description: "Pagination cursor from a previous result." },
  },
};

import { toToolDefinition, optionalNumber, optionalString } from "./define.ts";
import { initiativeLabelListResultSchema } from "./schemas.ts";
import { renderInitiativeLabelList } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { InitiativeServiceLike } from "../linear/services/enterprise-service.ts";

/** Registry-ready definition bound to the InitiativeServiceLike service. */
export function createListInitiativeLabelsTool(service: InitiativeServiceLike): ToolDefinition {
  return toToolDefinition(listInitiativeLabelsTool, initiativeLabelListResultSchema, {
    async execute(args) {
      const a = args as Record<string, unknown>;
      return service.listInitiativeLabels({
        limit: optionalNumber(a.limit),
        cursor: optionalString(a.cursor),
      });
    },
    render(value) {
      return renderInitiativeLabelList(value);
    },
  });
}
