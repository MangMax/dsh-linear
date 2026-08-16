/**
 * `linear_prepare_attachment_upload` (plan §68.1 A — WRITE).
 *
 * Prepare a signed direct upload for an attachment. Upload raw bytes with
 * PUT to `uploadUrl`, carrying every returned header VERBATIM (casing
 * included), within 60 seconds — then finalize with
 * `linear_create_attachment_from_upload`.
 */
import type { ToolSpec } from "./types.ts";

export const prepareAttachmentUploadTool: ToolSpec = {
  name: "linear_prepare_attachment_upload",
  description:
    "Prepare a direct Linear file upload: returns a signed upload URL and required headers. Upload raw bytes with PUT (curl --data-binary) sending the headers verbatim within 60 seconds, then call linear_create_attachment_from_upload to link the asset to an issue.",
  parameters: {
    filename: { type: "string", description: "File name, e.g. report.pdf.", required: true },
    contentType: {
      type: "string",
      description: "MIME type, e.g. application/pdf.",
      required: true,
    },
    size: { type: "number", description: "File size in bytes (1 .. 20 MB).", required: true },
  },
};

import { toToolDefinition, optionalNumber, optionalString } from "./define.ts";
import { attachmentUploadPlanSchema } from "./schemas.ts";
import { renderAttachmentUploadPlan } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { AttachmentService } from "../linear/services/attachment-service.ts";

/** Registry-ready definition bound to the attachment service. */
export function createPrepareAttachmentUploadTool(service: AttachmentService): ToolDefinition {
  return toToolDefinition(prepareAttachmentUploadTool, attachmentUploadPlanSchema, {
    async execute(args) {
      const a = args as { filename?: unknown; contentType?: unknown; size?: unknown };
      return service.prepareAttachmentUpload(
        optionalString(a.filename) ?? "",
        optionalString(a.contentType) ?? "",
        optionalNumber(a.size) ?? 0,
      );
    },
    render(value) {
      return renderAttachmentUploadPlan(value);
    },
  });
}
