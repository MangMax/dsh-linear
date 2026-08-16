/**
 * `linear_list_release_pipelines` (v0.2 continuation).
 */
import type { ToolSpec } from "./types.ts";

export const listReleasePipelinesTool: ToolSpec = {
  name: "linear_list_release_pipelines",
  description: "List release pipelines in the workspace.",
  parameters: {
    limit: { type: "number", description: "Max results, default 20, hard cap 50." },
    cursor: { type: "string", description: "Pagination cursor from a previous result." },
  },
};

import { toToolDefinition, optionalNumber, optionalString } from "./define.ts";
import { releasePipelineListResultSchema } from "./schemas.ts";
import { renderReleasePipelineList } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { ReleaseServiceLike } from "../linear/services/enterprise-service.ts";

/** Registry-ready definition bound to the ReleaseServiceLike service. */
export function createListReleasePipelinesTool(service: ReleaseServiceLike): ToolDefinition {
  return toToolDefinition(listReleasePipelinesTool, releasePipelineListResultSchema, {
    async execute(args) {
      const a = args as Record<string, unknown>;
      return service.listReleasePipelines({
        limit: optionalNumber(a.limit),
        cursor: optionalString(a.cursor),
      });
    },
    render(value) {
      return renderReleasePipelineList(value);
    },
  });
}
