/**
 * `linear_list_comments` (v0.2 tool batch).
 *
 * Paged comments of one issue — for long threads beyond the context
 * window (plan §10.4 surface expansion).
 */
import type { ToolSpec } from "./types.ts";

export const listCommentsTool: ToolSpec = {
  name: "linear_list_comments",
  description: "List comments on a Linear issue.",
  parameters: {
    issue: {
      type: "string",
      description: "Issue identifier (ENG-123), URL, or UUID.",
      required: true,
    },
    limit: { type: "number", description: "Max results, default 20, hard cap 50." },
    cursor: { type: "string", description: "Pagination cursor from a previous result." },
  },
};

import { toToolDefinition, optionalNumber, optionalString } from "./define.ts";
import { pagedResultSchema, commentSummarySchema } from "./schemas.ts";
import { renderCommentList } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { CommentService } from "../linear/services/comment-service.ts";

/** Registry-ready definition bound to a comment service. */
export function createListCommentsTool(comments: CommentService): ToolDefinition {
  return toToolDefinition(listCommentsTool, pagedResultSchema(commentSummarySchema), {
    async execute(args) {
      const a = args as { issue?: unknown; limit?: unknown; cursor?: unknown };
      return comments.listComments(optionalString(a.issue) ?? "", {
        limit: optionalNumber(a.limit),
        cursor: optionalString(a.cursor),
      });
    },
    render(value) {
      return renderCommentList(value);
    },
  });
}
