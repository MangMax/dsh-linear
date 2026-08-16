/**
 * Attachment domain service (plan §68 — v0.2 surface).
 *
 * `listAttachments` pages the attachments of one issue (identifier / URL /
 * UUID, §31); `createAttachment` links an external URL to an issue via the
 * SDK `createAttachment` mutation; `deleteAttachment` (Codex parity, write-
 * gated) removes an attachment by ID. Direct file uploads (prepare → signed
 * PUT → finalize) need a file byte channel the harness tool surface does
 * not carry yet — URL attachments cover the practical linking case; the
 * upload pipeline stays future work (§68).
 */
import type { AttachmentSummary } from "../../model/people.ts";
import { normalizeLimit, type PagedResult } from "../../model/pagination.ts";
import { toPagedResult } from "../pagination.ts";
import { LinearConnectorError, normalizeLinearError } from "../error.ts";
import { parseIssueReference } from "../issue-reference.ts";
import type { LinearClientFactoryLike } from "../client-factory.ts";

/** Minimal structural view of the SDK Attachment row (plan §64). */
export interface SdkAttachmentViewLike {
  id: string;
  title: string;
  url: string;
  sourceType?: string | null;
  createdAt: Date;
}

/** Signed upload plan (plan §68.1): the model PUTs bytes to uploadUrl with
 * the headers verbatim, then finalizes via createAttachmentFromUpload. */
export interface AttachmentUploadPlan {
  assetUrl: string;
  uploadUrl: string;
  headers: Array<{ key: string; value: string }>;
  filename: string;
  contentType: string;
  size: number;
}

/** File byte channel for the one-shot upload (plan §68.1 B). The harness
 * adapter reads a workspace file; this seam keeps the service free of
 * platform-specific fs APIs (cross-platform by construction). */
export interface AttachmentFileReader {
  read(path: string): Promise<{
    bytes: Uint8Array;
    filename: string;
    contentType: string;
    size: number;
  }>;
}

export interface AttachmentService {
  listAttachments(
    issue: string,
    options?: { limit?: number; cursor?: string },
  ): Promise<PagedResult<AttachmentSummary>>;
  /** Link an external URL to an issue (same-url re-link updates the row). */
  createAttachment(issue: string, url: string, title: string): Promise<AttachmentSummary>;
  /** Codex parity: delete an attachment by ID (write-gated). */
  deleteAttachment(id: string): Promise<void>;
  /** §68.1 A: prepare a signed direct upload (60 s window, verbatim headers). */
  prepareAttachmentUpload(
    filename: string,
    contentType: string,
    size: number,
  ): Promise<AttachmentUploadPlan>;
  /** §68.1 A: link an already-uploaded assetUrl to an issue. */
  createAttachmentFromUpload(
    issue: string,
    assetUrl: string,
    title?: string,
  ): Promise<AttachmentSummary>;
  /** §68.1 B: one-shot upload — read a local file, prepare, PUT, finalize.
   * Cross-platform by construction: the PUT runs host-side via fetch, so the
   * model never issues shell commands. */
  uploadAttachmentFile(issue: string, path: string, title?: string): Promise<AttachmentSummary>;
}

export class LinearAttachmentService implements AttachmentService {
  constructor(
    private readonly factory: LinearClientFactoryLike,
    private readonly fileReader?: AttachmentFileReader,
  ) {}

  async listAttachments(
    issue: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<PagedResult<AttachmentSummary>> {
    const limit = normalizeLimit(options.limit);
    const parsed = parseIssueReference(issue);
    try {
      const client = (await this.factory.create()) as unknown as {
        issue(id: string): Promise<
          | {
              attachments(variables: { first: number; after?: string }): Promise<{
                nodes: SdkAttachmentViewLike[];
                pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
              }>;
            }
          | undefined
        >;
      };
      const issueModel = await client.issue(parsed.value);
      if (!issueModel) {
        throw LinearConnectorError.notFound("issue", issue);
      }
      const connection = await issueModel.attachments({
        first: limit,
        after: options.cursor ?? undefined,
      });
      return toPagedResult(connection.nodes.map(mapAttachment), connection.pageInfo);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async createAttachment(issue: string, url: string, title: string): Promise<AttachmentSummary> {
    const parsed = parseIssueReference(issue);
    try {
      const client = (await this.factory.create()) as unknown as {
        createAttachment(input: {
          issueId: string;
          url: string;
          title: string;
        }): Promise<{ attachment?: unknown }>;
      };
      const result = await client.createAttachment({
        issueId: parsed.value,
        url,
        title,
      });
      if (!result?.attachment) {
        throw LinearConnectorError.validation("Linear did not return the created attachment.");
      }
      // Payload entity fields are LAZY (LinearFetch) — await before mapping
      // (same seam as createIssue, §64).
      const attachment = (await Promise.resolve(result.attachment)) as SdkAttachmentViewLike;
      return mapAttachment(attachment);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async deleteAttachment(id: string): Promise<void> {
    const trimmed = id?.trim();
    if (!trimmed) {
      throw LinearConnectorError.validation("attachment id must not be empty.");
    }
    try {
      const client = (await this.factory.create()) as unknown as {
        deleteAttachment(id: string): Promise<unknown>;
      };
      await client.deleteAttachment(trimmed);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async prepareAttachmentUpload(
    filename: string,
    contentType: string,
    size: number,
  ): Promise<AttachmentUploadPlan> {
    const name = filename?.trim();
    const type = contentType?.trim();
    if (!name) {
      throw LinearConnectorError.validation("filename must not be empty.");
    }
    if (!type) {
      throw LinearConnectorError.validation("contentType must not be empty.");
    }
    if (!Number.isFinite(size) || size <= 0 || size > 20 * 1024 * 1024) {
      throw LinearConnectorError.validation("size must be within 1 byte .. 20 MB.");
    }
    try {
      const client = (await this.factory.create()) as unknown as {
        fileUpload(
          contentType: string,
          filename: string,
          size: number,
        ): Promise<{
          success: boolean;
          uploadFile?: {
            assetUrl: string;
            uploadUrl: string;
            headers: Array<{ key: string; value: string }>;
            filename: string;
            contentType: string;
            size: number;
          } | null;
        }>;
      };
      const payload = await client.fileUpload(type, name, size);
      if (!payload?.success || !payload.uploadFile) {
        throw LinearConnectorError.validation("Linear could not prepare the upload.");
      }
      const upload = payload.uploadFile;
      return {
        assetUrl: upload.assetUrl,
        uploadUrl: upload.uploadUrl,
        // content-type is part of the GCS signature (X-Goog-SignedHeaders)
        // but the SDK does not return it as a header entry — prepend it so
        // the model always carries every signed header (live-run verified).
        headers: [
          { key: "content-type", value: upload.contentType },
          ...upload.headers.map((header) => ({ key: header.key, value: header.value })),
        ],
        filename: upload.filename,
        contentType: upload.contentType,
        size: upload.size,
      };
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async createAttachmentFromUpload(
    issue: string,
    assetUrl: string,
    title?: string,
  ): Promise<AttachmentSummary> {
    const asset = assetUrl?.trim();
    if (!asset) {
      throw LinearConnectorError.validation("assetUrl must not be empty.");
    }
    const linkTitle = title?.trim() || "Uploaded attachment";
    return this.createAttachment(issue, asset, linkTitle);
  }

  async uploadAttachmentFile(
    issue: string,
    path: string,
    title?: string,
  ): Promise<AttachmentSummary> {
    if (!this.fileReader) {
      throw LinearConnectorError.validation(
        "File uploads are not available in this deployment (no file reader seam).",
      );
    }
    const target = path?.trim();
    if (!target) {
      throw LinearConnectorError.validation("file path must not be empty.");
    }
    const file = await this.fileReader.read(target);
    if (file.size <= 0 || file.size > 20 * 1024 * 1024) {
      throw LinearConnectorError.validation("file size must be within 1 byte .. 20 MB.");
    }
    const plan = await this.prepareAttachmentUpload(file.filename, file.contentType, file.size);
    const headers: Record<string, string> = {};
    for (const header of plan.headers) headers[header.key] = header.value;
    let response: Response;
    try {
      response = await fetch(plan.uploadUrl, {
        method: "PUT",
        headers,
        body: file.bytes,
      });
    } catch (err) {
      throw normalizeLinearError(err);
    }
    if (!response.ok) {
      throw new LinearConnectorError(
        "NETWORK_ERROR",
        `The upload PUT failed with HTTP ${response.status}. Re-run prepare and retry.`,
      );
    }
    return this.createAttachmentFromUpload(issue, plan.assetUrl, title ?? file.filename);
  }
}
export function mapAttachment(attachment: SdkAttachmentViewLike): AttachmentSummary {
  return {
    id: attachment.id,
    title: attachment.title,
    url: attachment.url,
    ...(attachment.sourceType ? { sourceType: attachment.sourceType } : {}),
    createdAt: attachment.createdAt.toISOString(),
  };
}
