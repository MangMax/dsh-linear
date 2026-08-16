/**
 * Comment domain service (plan §10.7, §30; v0.2 expansion: listComments).
 *
 * Milestone 4 ships the write side: {@link LinearCommentService#addComment}
 * resolves the issue reference (§31), validates the body, creates the
 * comment through the SDK, and maps the result to the canonical
 * {@link CommentSummary} — the SDK model never leaks to the tool layer.
 * The v0.2 batch adds {@link LinearCommentService#listComments}: paged
 * comments of one issue, mapped with the shared {@link mapComment}.
 */
import type { CommentSummary } from "../../model/issue.ts";
import { normalizeLimit, type PagedResult } from "../../model/pagination.ts";
import { toPagedResult } from "../pagination.ts";
import type { LinearClientFactoryLike } from "../client-factory.ts";
import { LinearConnectorError, normalizeLinearError } from "../error.ts";
import { parseIssueReference } from "../issue-reference.ts";
import { mapComment, type SdkCommentView } from "./issue-mapper.ts";

export interface AddCommentInput {
  /** Issue identifier (ENG-123), URL, or UUID. */
  issue: string;
  body: string;
}

export interface CommentService {
  addComment(input: AddCommentInput): Promise<CommentSummary>;
  listComments(
    issue: string,
    options?: { limit?: number; cursor?: string },
  ): Promise<PagedResult<CommentSummary>>;
  /** Codex parity: delete a comment by ID (write-gated). */
  deleteComment(id: string): Promise<void>;
  /** Codex parity: update a comment body by ID (write-gated). */
  updateComment(id: string, body: string): Promise<CommentSummary>;
}

/** {@link CommentService} over the Linear SDK. */
export class LinearCommentService implements CommentService {
  constructor(
    private readonly factory: LinearClientFactoryLike,
    /**
     * Users catalog for author mapping (plan §32 — never per-item
     * follow-ups). Absent in headless/embedded use: authors stay unnamed.
     */
    private readonly users?: {
      getUsers(): Promise<Array<{ id: string; name: string }>>;
    },
  ) {}

  async addComment(input: AddCommentInput): Promise<CommentSummary> {
    const parsed = parseIssueReference(input.issue);
    const body = input.body?.trim();
    if (!body) {
      throw LinearConnectorError.validation("comment body must not be empty.");
    }
    const client = await this.factory.create();
    try {
      const result = await client.createComment({ issueId: parsed.value, body });
      if (!result?.comment) {
        throw LinearConnectorError.validation(
          "Linear did not return the created comment. Verify the workspace allows commenting.",
        );
      }
      const comment = await result.comment;
      const author = await comment.user;
      return {
        id: comment.id,
        body: comment.body,
        author: author ? { id: author.id, name: author.name } : undefined,
        createdAt: comment.createdAt.toISOString(),
      };
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async listComments(
    issue: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<PagedResult<CommentSummary>> {
    const limit = normalizeLimit(options.limit);
    const parsed = parseIssueReference(issue);
    try {
      const client = (await this.factory.create()) as unknown as {
        issue(id: string): Promise<
          | {
              comments(variables: { first: number; after?: string }): Promise<{
                nodes: Array<SdkCommentView & { userId?: string }>;
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
      const connection = await issueModel.comments({
        first: limit,
        after: options.cursor ?? undefined,
      });
      // Author names come from the shared users catalog, never per-comment
      // follow-ups (§32). The SDK comment exposes userId; the view maps it.
      const authors = new Map<string, { id: string; name: string }>();
      if (this.users) {
        for (const user of await this.users.getUsers()) authors.set(user.id, user);
      }
      const items = connection.nodes.map((comment) =>
        mapComment({
          id: comment.id,
          body: comment.body,
          createdAt: comment.createdAt,
          author: comment.userId ? authors.get(comment.userId) : undefined,
        }),
      );
      return toPagedResult(items, connection.pageInfo);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async deleteComment(id: string): Promise<void> {
    const trimmed = id?.trim();
    if (!trimmed) {
      throw LinearConnectorError.validation("comment id must not be empty.");
    }
    const client = await this.factory.create();
    try {
      await client.deleteComment(trimmed);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async updateComment(id: string, body: string): Promise<CommentSummary> {
    const trimmed = id?.trim();
    const next = body?.trim();
    if (!trimmed) {
      throw LinearConnectorError.validation("comment id must not be empty.");
    }
    if (!next) {
      throw LinearConnectorError.validation("comment body must not be empty.");
    }
    const client = await this.factory.create();
    try {
      const result = await client.updateComment(trimmed, { body: next });
      if (!result?.comment) {
        throw LinearConnectorError.validation("Linear did not return the updated comment.");
      }
      const comment = (await Promise.resolve(result.comment)) as {
        id: string;
        body: string;
        createdAt: Date;
        user?: unknown;
      };
      const author = comment.user
        ? ((await Promise.resolve(comment.user)) as { id: string; name: string } | undefined)
        : undefined;
      return {
        id: comment.id,
        body: comment.body,
        author: author ? { id: author.id, name: author.name } : undefined,
        createdAt: comment.createdAt.toISOString(),
      };
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }
}
