/**
 * `linear_list_release_notes` (v0.2 continuation).
 */
import type { ToolSpec } from "./types.ts";

export const listReleaseNotesTool: ToolSpec = {
  name: "linear_list_release_notes",
  description: "List release notes in the workspace.",
  parameters: {
    limit: { type: "number", description: "Max results, default 20, hard cap 50." },
    cursor: { type: "string", description: "Pagination cursor from a previous result." },
  },
};

import { toToolDefinition, optionalNumber, optionalString } from "./define.ts";
import { releaseNoteListResultSchema } from "./schemas.ts";
import { renderReleaseNoteList } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { ReleaseServiceLike } from "../linear/services/enterprise-service.ts";

/** Registry-ready definition bound to the ReleaseServiceLike service. */
export function createListReleaseNotesTool(service: ReleaseServiceLike): ToolDefinition {
  return toToolDefinition(listReleaseNotesTool, releaseNoteListResultSchema, {
    async execute(args) {
      const a = args as Record<string, unknown>;
      return service.listReleaseNotes({
        limit: optionalNumber(a.limit),
        cursor: optionalString(a.cursor),
      });
    },
    render(value) {
      return renderReleaseNoteList(value);
    },
  });
}
