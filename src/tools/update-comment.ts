/**
 * `linear_update_comment` (Codex parity — WRITE).
 */
import type { ToolSpec } from "./types.ts";

export const updateCommentTool: ToolSpec = {
  name: "linear_update_comment",
  description: "Update a Linear comment body by ID.",
  parameters: {
    id: { type: "string", description: "Comment ID.", required: true },
    body: { type: "string", description: "New comment body (Markdown).", required: true },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { commentSummarySchema } from "./schemas.ts";
import { renderCommentList } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { CommentService } from "../linear/services/comment-service.ts";

/** Registry-ready definition bound to the comment service. */
export function createUpdateCommentTool(service: CommentService): ToolDefinition {
  return toToolDefinition(updateCommentTool, commentSummarySchema, {
    async execute(args) {
      const a = args as { id?: unknown; body?: unknown };
      return service.updateComment(optionalString(a.id) ?? "", optionalString(a.body) ?? "");
    },
    render(value) {
      return renderCommentList({ items: [value], hasMore: false } as never);
    },
  });
}
