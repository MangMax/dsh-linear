/**
 * `linear_upload_attachment_file` (plan §68.1 B — WRITE).
 *
 * One-shot file upload: reads a local file, prepares the signed upload,
 * PUTs the bytes host-side, and links the attachment — no shell commands,
 * cross-platform by construction (Windows/macOS/Linux identical).
 */
import type { ToolSpec } from "./types.ts";

export const uploadAttachmentFileTool: ToolSpec = {
  name: "linear_upload_attachment_file",
  description:
    "Upload a local file as an attachment to a Linear issue in one call. The connector reads the file, prepares the signed upload, uploads the bytes host-side, and links the attachment. Works cross-platform without shell commands. Max 20 MB.",
  parameters: {
    issue: {
      type: "string",
      description: "Issue identifier (ENG-123), URL, or UUID.",
      required: true,
    },
    path: {
      type: "string",
      description: "Local file path (absolute, or relative to the harness process cwd).",
      required: true,
    },
    title: {
      type: "string",
      description: "Attachment title shown in Linear; defaults to the file name.",
    },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { attachmentProperty } from "./schemas.ts";
import { renderAttachment } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { AttachmentService } from "../linear/services/attachment-service.ts";

/** Registry-ready definition bound to the attachment service. */
export function createUploadAttachmentFileTool(service: AttachmentService): ToolDefinition {
  return toToolDefinition(uploadAttachmentFileTool, attachmentProperty, {
    async execute(args) {
      const a = args as { issue?: unknown; path?: unknown; title?: unknown };
      return service.uploadAttachmentFile(
        optionalString(a.issue) ?? "",
        optionalString(a.path) ?? "",
        optionalString(a.title),
      );
    },
    render(value) {
      return renderAttachment(value);
    },
  });
}
