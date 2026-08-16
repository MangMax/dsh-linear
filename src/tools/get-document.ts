/**
 * `linear_get_document` (v0.2 continuation).
 */
import type { ToolSpec } from "./types.ts";

export const getDocumentTool: ToolSpec = {
  name: "linear_get_document",
  description: "Get a Linear document by ID or URL.",
  parameters: {
    document: { type: "string", description: "Document ID or URL.", required: true },
  },
};

import { toToolDefinition, optionalString } from "./define.ts";
import { documentProperty } from "./schemas.ts";
import { renderDocument } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { DocumentService } from "../linear/services/document-service.ts";

/** Registry-ready definition bound to a document service. */
export function createGetDocumentTool(documents: DocumentService): ToolDefinition {
  return toToolDefinition(getDocumentTool, documentProperty, {
    async execute(args) {
      const a = args as { document?: unknown };
      return documents.getDocument(optionalString(a.document) ?? "");
    },
    render(value) {
      return renderDocument(value);
    },
  });
}
