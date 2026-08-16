/**
 * `linear_list_releases` (v0.2 continuation).
 */
import type { ToolSpec } from "./types.ts";

export const listReleasesTool: ToolSpec = {
  name: "linear_list_releases",
  description: "List releases in the workspace.",
  parameters: {
    limit: { type: "number", description: "Max results, default 20, hard cap 50." },
    cursor: { type: "string", description: "Pagination cursor from a previous result." },
  },
};

import { toToolDefinition, optionalNumber, optionalString } from "./define.ts";
import { releaseListResultSchema } from "./schemas.ts";
import { renderReleaseList } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { ReleaseServiceLike } from "../linear/services/enterprise-service.ts";

/** Registry-ready definition bound to the ReleaseServiceLike service. */
export function createListReleasesTool(service: ReleaseServiceLike): ToolDefinition {
  return toToolDefinition(listReleasesTool, releaseListResultSchema, {
    async execute(args) {
      const a = args as Record<string, unknown>;
      return service.listReleases({
        limit: optionalNumber(a.limit),
        cursor: optionalString(a.cursor),
      });
    },
    render(value) {
      return renderReleaseList(value);
    },
  });
}
