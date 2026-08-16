/**
 * `linear_add_comment` (plan §10.7).
 *
 * `replyToComment` is deliberately NOT in the MVP surface. WRITE tool:
 * subject to the write policy (§36).
 */
import type { ToolSpec } from "./types.ts";

export const addCommentTool: ToolSpec = {
  name: "linear_add_comment",
  description: "Add a comment to a Linear issue.",
  parameters: {
    issue: {
      type: "string",
      required: true,
      description: "Linear issue identifier such as ENG-123, or an issue URL.",
    },
    body: { type: "string", required: true, description: "Comment body (Markdown supported)." },
  },
};

import { toToolDefinition } from "./define.ts";
import { commentSummarySchema } from "./schemas.ts";
import { renderAddComment } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { CommentService } from "../linear/services/comment-service.ts";

/** Registry-ready definition bound to a comment service (plan §10.7, §30). */
export function createAddCommentTool(comments: CommentService): ToolDefinition {
  return toToolDefinition(addCommentTool, commentSummarySchema, {
    async execute(args) {
      const a = args as { issue?: unknown; body?: unknown };
      return comments.addComment({
        issue: typeof a.issue === "string" ? a.issue : "",
        body: typeof a.body === "string" ? a.body : "",
      });
    },
    render(value) {
      return renderAddComment(value);
    },
  });
}
