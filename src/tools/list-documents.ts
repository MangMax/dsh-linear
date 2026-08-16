/**
 * `linear_list_documents` (v0.2 continuation).
 */
import type { ToolSpec } from "./types.ts";

export const listDocumentsTool: ToolSpec = {
  name: "linear_list_documents",
  description: "List documents in the Linear workspace.",
  parameters: {
    limit: { type: "number", description: "Max results, default 20, hard cap 50." },
    cursor: { type: "string", description: "Pagination cursor from a previous result." },
  },
};

import { toToolDefinition, optionalNumber, optionalString } from "./define.ts";
import { documentListResultSchema } from "./schemas.ts";
import { renderDocumentList } from "./render.ts";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { DocumentService } from "../linear/services/document-service.ts";

/** Registry-ready definition bound to a document service. */
export function createListDocumentsTool(documents: DocumentService): ToolDefinition {
  return toToolDefinition(listDocumentsTool, documentListResultSchema, {
    async execute(args) {
      const a = args as { limit?: unknown; cursor?: unknown };
      return documents.listDocuments({
        limit: optionalNumber(a.limit),
        cursor: optionalString(a.cursor),
      });
    },
    render(value) {
      return renderDocumentList(value);
    },
  });
}
