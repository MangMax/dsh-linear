/**
 * Status update domain service (plan §68 — v0.2 continuation).
 *
 * Project status updates (the SDK's `ProjectUpdate` model): workspace
 * listing (optionally project-narrowed), exact get by id/URL, and creation
 * (`createProjectUpdate`). Author names come from the shared users catalog
 * (§32 — never per-item follow-ups).
 */
import type { StatusUpdateSummary } from "../../model/content.ts";
import { normalizeLimit, type PagedResult } from "../../model/pagination.ts";
import { toPagedResult } from "../pagination.ts";
import { LinearConnectorError, normalizeLinearError } from "../error.ts";
import type { LinearClientFactoryLike } from "../client-factory.ts";
import type { ProjectResolver } from "../resolver/project.ts";

/** Minimal structural view of the SDK ProjectUpdate row (plan §64). */
export interface SdkStatusUpdateViewLike {
  id: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  projectId?: string | null;
  initiativeId?: string | null;
  userId?: string | null;
}

export interface StatusUpdateService {
  listStatusUpdates(options?: {
    project?: string;
    limit?: number;
    cursor?: string;
  }): Promise<PagedResult<StatusUpdateSummary>>;
  getStatusUpdate(ref: string): Promise<StatusUpdateSummary>;
  createStatusUpdate(project: string, body: string): Promise<StatusUpdateSummary>;
  /** Codex parity: delete a status update by ID (write-gated). */
  deleteStatusUpdate(id: string): Promise<void>;
  /** Codex parity: update a status update body by ID (write-gated). */
  updateStatusUpdate(id: string, body: string): Promise<StatusUpdateSummary>;
}

function parseUpdateId(ref: string): string {
  const trimmed = ref.trim();
  const url = /^https?:\/\//i.test(trimmed) ? new URL(trimmed) : undefined;
  if (url) {
    const segments = url.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? trimmed;
  }
  return trimmed;
}

export class LinearStatusUpdateService implements StatusUpdateService {
  constructor(
    private readonly factory: LinearClientFactoryLike,
    private readonly projects: ProjectResolver,
    private readonly users?: {
      getUsers(): Promise<Array<{ id: string; name: string }>>;
    },
  ) {}

  private async authorNames(): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    if (this.users) {
      for (const user of await this.users.getUsers()) names.set(user.id, user.name);
    }
    return names;
  }

  private map(update: SdkStatusUpdateViewLike, authors: Map<string, string>): StatusUpdateSummary {
    return {
      id: update.id,
      body: update.body,
      createdAt: update.createdAt.toISOString(),
      updatedAt: update.updatedAt.toISOString(),
      ...(update.projectId ? { projectId: update.projectId } : {}),
      ...(update.initiativeId ? { initiativeId: update.initiativeId } : {}),
      ...(update.userId && authors.has(update.userId)
        ? { authorName: authors.get(update.userId) }
        : {}),
    };
  }

  async listStatusUpdates(
    options: { project?: string; limit?: number; cursor?: string } = {},
  ): Promise<PagedResult<StatusUpdateSummary>> {
    const limit = normalizeLimit(options.limit);
    try {
      const client = (await this.factory.create()) as unknown as {
        projectUpdates(variables: Record<string, unknown>): Promise<{
          nodes: SdkStatusUpdateViewLike[];
          pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
        }>;
      };
      const filter: Record<string, unknown> = {};
      if (options.project?.trim()) {
        const project = await this.projects.resolveProject(options.project.trim());
        filter.project = { id: { eq: project.id } };
      }
      const connection = await client.projectUpdates({
        ...(Object.keys(filter).length > 0 ? { filter } : {}),
        first: limit,
        after: options.cursor ?? undefined,
      });
      const authors = await this.authorNames();
      return toPagedResult(
        connection.nodes.map((update) => this.map(update, authors)),
        connection.pageInfo,
      );
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async getStatusUpdate(ref: string): Promise<StatusUpdateSummary> {
    try {
      const client = (await this.factory.create()) as unknown as {
        projectUpdate(id: string): Promise<SdkStatusUpdateViewLike | undefined>;
      };
      const update = await client.projectUpdate(parseUpdateId(ref));
      if (!update) {
        throw LinearConnectorError.notFound("status update", ref);
      }
      return this.map(update, await this.authorNames());
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async createStatusUpdate(project: string, body: string): Promise<StatusUpdateSummary> {
    const trimmed = body?.trim();
    if (!trimmed) {
      throw LinearConnectorError.validation("status update body must not be empty.");
    }
    try {
      const client = (await this.factory.create()) as unknown as {
        createProjectUpdate(input: {
          projectId: string;
          body: string;
        }): Promise<{ projectUpdate?: unknown }>;
      };
      const resolved = await this.projects.resolveProject(project);
      const result = await client.createProjectUpdate({
        projectId: resolved.id,
        body: trimmed,
      });
      if (!result?.projectUpdate) {
        throw LinearConnectorError.validation("Linear did not return the created status update.");
      }
      // Payload entity fields are LAZY (LinearFetch) — await before mapping (§64).
      const update = (await Promise.resolve(result.projectUpdate)) as SdkStatusUpdateViewLike;
      return this.map(update, await this.authorNames());
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async deleteStatusUpdate(id: string): Promise<void> {
    const trimmed = id?.trim();
    if (!trimmed) {
      throw LinearConnectorError.validation("status update id must not be empty.");
    }
    try {
      const client = (await this.factory.create()) as unknown as {
        deleteProjectUpdate(id: string): Promise<unknown>;
      };
      await client.deleteProjectUpdate(trimmed);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async updateStatusUpdate(id: string, body: string): Promise<StatusUpdateSummary> {
    const trimmed = id?.trim();
    const next = body?.trim();
    if (!trimmed) {
      throw LinearConnectorError.validation("status update id must not be empty.");
    }
    if (!next) {
      throw LinearConnectorError.validation("status update body must not be empty.");
    }
    try {
      const client = (await this.factory.create()) as unknown as {
        updateProjectUpdate(
          id: string,
          input: { body: string },
        ): Promise<{
          projectUpdate?: unknown;
        }>;
      };
      const result = await client.updateProjectUpdate(trimmed, { body: next });
      if (!result?.projectUpdate) {
        throw LinearConnectorError.validation("Linear did not return the updated status update.");
      }
      const update = (await Promise.resolve(result.projectUpdate)) as SdkStatusUpdateViewLike;
      return this.map(update, await this.authorNames());
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }
}
