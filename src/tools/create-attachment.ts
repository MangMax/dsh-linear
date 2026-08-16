/**
 * `linear_create_attachment` (v0.2 tool batch — WRITE).
 *
 * Link an external URL to an issue. Same-URL re-links update the existing
 * row (Linear semantics). Direct file uploads (prepare → signed PUT →
 * finalize) need a file-byte channel the harness tool surface does not
 * carry yet; URL attachments cover the practical linking case (§68).
 */
import type { ToolSpec } from "./types.ts";

export const createAttachmentTool: ToolSpec = {
  name: "linear_create_attachment",
  description: "Link an external URL to a Linear issue as an attachment.",
  parameters: {
    issue: {
      type: "string",
      description: "Issue identifier (ENG-123), URL, or UUID.",
      required: true,
    },
    url: { type: "string", description: "Attachment URL to link.", required: true },
    title: { type: "string", description: "Attachment title shown in Linear.", required: true },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { attachmentProperty } from "./schemas.ts";
import { renderAttachment } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { AttachmentService } from "../linear/services/attachment-service.ts";

/** Registry-ready definition bound to an attachment service. */
export function createCreateAttachmentTool(attachments: AttachmentService): ToolDefinition {
  return toToolDefinition(createAttachmentTool, attachmentProperty, {
    async execute(args) {
      const a = args as { issue?: unknown; url?: unknown; title?: unknown };
      return attachments.createAttachment(
        optionalString(a.issue) ?? "",
        optionalString(a.url) ?? "",
        optionalString(a.title) ?? "",
      );
    },
    render(value) {
      return renderAttachment(value);
    },
  });
}
