/**
 * `linear_delete_comment` (Codex parity — WRITE).
 */
import type { ToolSpec } from "./types.ts";

export const deleteCommentTool: ToolSpec = {
  name: "linear_delete_comment",
  description: "Delete a Linear comment by ID.",
  parameters: {
    id: { type: "string", description: "Comment ID.", required: true },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { okSchema } from "./schemas.ts";
import { renderOk } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { CommentService } from "../linear/services/comment-service.ts";

/** Registry-ready definition bound to the comment service. */
export function createDeleteCommentTool(service: CommentService): ToolDefinition {
  return toToolDefinition(deleteCommentTool, okSchema, {
    async execute(args) {
      const a = args as { id?: unknown };
      await service.deleteComment(optionalString(a.id) ?? "");
      return { ok: true };
    },
    render(value) {
      return renderOk(value);
    },
  });
}
