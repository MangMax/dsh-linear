/**
 * Document + milestone domain services (plan §68 — v0.2 continuation).
 *
 * Workspace documents and project milestones over the SDK surfaces, with
 * the usual canonical mapping. Milestone lookup by name goes through the
 * workspace milestone list (no dedicated resolver yet — names are
 * project-scoped, so a name lookup narrows by project when provided).
 */
import type { DocumentSummary, MilestoneSummary } from "../../model/content.ts";
import { normalizeLimit, type PagedResult } from "../../model/pagination.ts";
import { toPagedResult } from "../pagination.ts";
import { LinearConnectorError, normalizeLinearError } from "../error.ts";
import type { LinearClientFactoryLike } from "../client-factory.ts";
import type { ProjectResolver } from "../resolver/project.ts";

/** Minimal structural views of the SDK rows (plan §64). */
export interface SdkDocumentViewLike {
  id: string;
  title: string;
  url: string;
  projectId?: string | null;
  initiativeId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SdkMilestoneViewLike {
  id: string;
  name: string;
  targetDate?: string | null;
  description?: string | null;
  projectId?: string | null;
}

export interface DocumentService {
  listDocuments(options?: {
    limit?: number;
    cursor?: string;
  }): Promise<PagedResult<DocumentSummary>>;
  /** `ref` is a document ID or a Linear document URL. */
  getDocument(ref: string): Promise<DocumentSummary>;
}

export interface MilestoneService {
  listMilestones(options?: {
    project?: string;
    limit?: number;
    cursor?: string;
  }): Promise<PagedResult<MilestoneSummary>>;
  getMilestone(ref: string, options?: { project?: string }): Promise<MilestoneSummary>;
  /** Codex parity: create a milestone in a project (write-gated). */
  createMilestone(
    project: string,
    name: string,
    options?: { targetDate?: string },
  ): Promise<MilestoneSummary>;
  /** Codex parity: update a milestone (write-gated). */
  updateMilestone(
    id: string,
    options?: { name?: string; targetDate?: string },
  ): Promise<MilestoneSummary>;
}

function parseEntityId(ref: string): string {
  const trimmed = ref.trim();
  const url = /^https?:\/\//i.test(trimmed) ? new URL(trimmed) : undefined;
  if (url) {
    const segments = url.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? trimmed;
  }
  return trimmed;
}

export class LinearDocumentService implements DocumentService {
  constructor(private readonly factory: LinearClientFactoryLike) {}

  async listDocuments(
    options: { limit?: number; cursor?: string } = {},
  ): Promise<PagedResult<DocumentSummary>> {
    const limit = normalizeLimit(options.limit);
    try {
      const client = (await this.factory.create()) as unknown as {
        documents(variables: Record<string, unknown>): Promise<{
          nodes: SdkDocumentViewLike[];
          pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
        }>;
      };
      const connection = await client.documents({
        first: limit,
        after: options.cursor ?? undefined,
      });
      return toPagedResult(connection.nodes.map(mapDocument), connection.pageInfo);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async getDocument(ref: string): Promise<DocumentSummary> {
    try {
      const client = (await this.factory.create()) as unknown as {
        document(id: string): Promise<SdkDocumentViewLike | undefined>;
      };
      const document = await client.document(parseEntityId(ref));
      if (!document) {
        throw LinearConnectorError.notFound("document", ref);
      }
      return mapDocument(document);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }
}

export function mapDocument(document: SdkDocumentViewLike): DocumentSummary {
  return {
    id: document.id,
    title: document.title,
    url: document.url,
    ...(document.projectId ? { projectId: document.projectId } : {}),
    ...(document.initiativeId ? { initiativeId: document.initiativeId } : {}),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

export class LinearMilestoneService implements MilestoneService {
  constructor(
    private readonly factory: LinearClientFactoryLike,
    private readonly projects: ProjectResolver,
  ) {}

  async listMilestones(
    options: { project?: string; limit?: number; cursor?: string } = {},
  ): Promise<PagedResult<MilestoneSummary>> {
    const limit = normalizeLimit(options.limit);
    try {
      const client = (await this.factory.create()) as unknown as {
        projectMilestones(variables: Record<string, unknown>): Promise<{
          nodes: SdkMilestoneViewLike[];
          pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
        }>;
      };
      const filter: Record<string, unknown> = {};
      if (options.project?.trim()) {
        const project = await this.projects.resolveProject(options.project.trim());
        filter.project = { id: { eq: project.id } };
      }
      const connection = await client.projectMilestones({
        ...(Object.keys(filter).length > 0 ? { filter } : {}),
        first: limit,
        after: options.cursor ?? undefined,
      });
      return toPagedResult(connection.nodes.map(mapMilestone), connection.pageInfo);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async getMilestone(ref: string, options: { project?: string } = {}): Promise<MilestoneSummary> {
    // No dedicated milestone-by-name query exists on the SDK seam, so name
    // lookups scan the (optionally project-narrowed) milestone list.
    const id = parseEntityId(ref);
    if (/^[0-9a-f-]{36}$/i.test(id)) {
      try {
        const client = (await this.factory.create()) as unknown as {
          projectMilestone(id: string): Promise<SdkMilestoneViewLike | undefined>;
        };
        const milestone = await client.projectMilestone(id);
        if (!milestone) {
          throw LinearConnectorError.notFound("milestone", ref);
        }
        return mapMilestone(milestone);
      } catch (err) {
        throw normalizeLinearError(err);
      }
    }
    const result = await this.listMilestones({
      project: options.project,
      limit: 50,
    });
    const exact = result.items.find((item) => item.name === ref.trim());
    if (!exact) {
      throw LinearConnectorError.notFound("milestone", ref);
    }
    return exact;
  }

  async createMilestone(
    project: string,
    name: string,
    options: { targetDate?: string } = {},
  ): Promise<MilestoneSummary> {
    const trimmed = name?.trim();
    if (!trimmed) {
      throw LinearConnectorError.validation("milestone name must not be empty.");
    }
    try {
      const client = (await this.factory.create()) as unknown as {
        createProjectMilestone(input: Record<string, unknown>): Promise<{
          projectMilestone?: unknown;
        }>;
      };
      const resolved = await this.projects.resolveProject(project);
      const input: Record<string, unknown> = { name: trimmed, projectId: resolved.id };
      if (options.targetDate) input.targetDate = options.targetDate;
      const result = await client.createProjectMilestone(input);
      if (!result?.projectMilestone) {
        throw LinearConnectorError.validation("Linear did not return the created milestone.");
      }
      const milestone = (await Promise.resolve(result.projectMilestone)) as SdkMilestoneViewLike;
      return mapMilestone(milestone);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async updateMilestone(
    id: string,
    options: { name?: string; targetDate?: string } = {},
  ): Promise<MilestoneSummary> {
    const trimmed = id?.trim();
    if (!trimmed) {
      throw LinearConnectorError.validation("milestone id must not be empty.");
    }
    try {
      const client = (await this.factory.create()) as unknown as {
        updateProjectMilestone(
          id: string,
          input: Record<string, unknown>,
        ): Promise<{
          projectMilestone?: unknown;
        }>;
      };
      const input: Record<string, unknown> = {};
      if (options.name?.trim()) input.name = options.name.trim();
      if (options.targetDate) input.targetDate = options.targetDate;
      const result = await client.updateProjectMilestone(trimmed, input);
      if (!result?.projectMilestone) {
        throw LinearConnectorError.validation("Linear did not return the updated milestone.");
      }
      const milestone = (await Promise.resolve(result.projectMilestone)) as SdkMilestoneViewLike;
      return mapMilestone(milestone);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }
}
export function mapMilestone(milestone: SdkMilestoneViewLike): MilestoneSummary {
  return {
    id: milestone.id,
    name: milestone.name,
    ...(milestone.targetDate ? { targetDate: milestone.targetDate } : {}),
    ...(milestone.description ? { description: milestone.description } : {}),
    ...(milestone.projectId ? { projectId: milestone.projectId } : {}),
  };
}
