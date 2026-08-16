/**
 * `linear_list_attachments` (v0.2 tool batch).
 *
 * Attachments of one issue — links, screenshots and referenced URLs.
 */
import type { ToolSpec } from "./types.ts";

export const listAttachmentsTool: ToolSpec = {
  name: "linear_list_attachments",
  description: "List attachments on a Linear issue.",
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
import { attachmentListResultSchema } from "./schemas.ts";
import { renderAttachmentList } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { AttachmentService } from "../linear/services/attachment-service.ts";

/** Registry-ready definition bound to an attachment service. */
export function createListAttachmentsTool(attachments: AttachmentService): ToolDefinition {
  return toToolDefinition(listAttachmentsTool, attachmentListResultSchema, {
    async execute(args) {
      const a = args as { issue?: unknown; limit?: unknown; cursor?: unknown };
      return attachments.listAttachments(optionalString(a.issue) ?? "", {
        limit: optionalNumber(a.limit),
        cursor: optionalString(a.cursor),
      });
    },
    render(value) {
      return renderAttachmentList(value);
    },
  });
}
