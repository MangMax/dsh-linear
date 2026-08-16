/**
 * `linear_create_attachment_from_upload` (plan §68.1 A — WRITE).
 *
 * Link an already-uploaded Linear assetUrl to an issue as an attachment.
 * Call this only after a successful PUT of the raw bytes to the upload URL
 * from `linear_prepare_attachment_upload`. This tool does not upload file
 * content; it only creates the attachment row.
 */
import type { ToolSpec } from "./types.ts";

export const createAttachmentFromUploadTool: ToolSpec = {
  name: "linear_create_attachment_from_upload",
  description:
    "Link an already-uploaded Linear assetUrl to an issue as an attachment. Use only after linear_prepare_attachment_upload returned the assetUrl and the raw bytes were PUT to the signed upload URL.",
  parameters: {
    issue: {
      type: "string",
      description: "Issue identifier (ENG-123), URL, or UUID.",
      required: true,
    },
    assetUrl: {
      type: "string",
      description: "The assetUrl returned by linear_prepare_attachment_upload.",
      required: true,
    },
    title: { type: "string", description: "Attachment title shown in Linear." },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { attachmentProperty } from "./schemas.ts";
import { renderAttachment } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { AttachmentService } from "../linear/services/attachment-service.ts";

/** Registry-ready definition bound to the attachment service. */
export function createCreateAttachmentFromUploadTool(service: AttachmentService): ToolDefinition {
  return toToolDefinition(createAttachmentFromUploadTool, attachmentProperty, {
    async execute(args) {
      const a = args as { issue?: unknown; assetUrl?: unknown; title?: unknown };
      return service.createAttachmentFromUpload(
        optionalString(a.issue) ?? "",
        optionalString(a.assetUrl) ?? "",
        optionalString(a.title),
      );
    },
    render(value) {
      return renderAttachment(value);
    },
  });
}
