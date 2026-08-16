/**
 * `linear_delete_attachment` (Codex parity — WRITE).
 */
import type { ToolSpec } from "./types.ts";

export const deleteAttachmentTool: ToolSpec = {
  name: "linear_delete_attachment",
  description: "Delete an attachment by ID.",
  parameters: {
    id: { type: "string", description: "Attachment ID.", required: true },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { okSchema } from "./schemas.ts";
import { renderOk } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { AttachmentService } from "../linear/services/attachment-service.ts";

/** Registry-ready definition bound to the attachment service. */
export function createDeleteAttachmentTool(service: AttachmentService): ToolDefinition {
  return toToolDefinition(deleteAttachmentTool, okSchema, {
    async execute(args) {
      const a = args as { id?: unknown };
      await service.deleteAttachment(optionalString(a.id) ?? "");
      return { ok: true };
    },
    render(value) {
      return renderOk(value);
    },
  });
}
