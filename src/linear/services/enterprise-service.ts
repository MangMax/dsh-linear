/**
 * Initiative + release + customer domain services (plan §68 — v0.2
 * continuation batch). Workspace-level entity surfaces with the usual
 * canonical mapping; release creation resolves the pipeline by name
 * (no dedicated pipeline resolver — the list scan is bounded).
 */
import type {
  CustomerSummary,
  InitiativeLabelSummary,
  InitiativeSummary,
  ReleaseNoteSummary,
  ReleasePipelineSummary,
  ReleaseSummary,
} from "../../model/content.ts";
import { normalizeLimit, type PagedResult } from "../../model/pagination.ts";
import { toPagedResult } from "../pagination.ts";
import { LinearConnectorError, normalizeLinearError } from "../error.ts";
import type { LinearClientFactoryLike } from "../client-factory.ts";

/** Structural views of the SDK rows (plan §64). */
export interface SdkInitiativeViewLike {
  id: string;
  name: string;
  url: string;
  description?: string | null;
  status?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SdkInitiativeLabelViewLike {
  id: string;
  name: string;
  color?: string | null;
}

export interface SdkReleaseViewLike {
  id: string;
  name: string;
  url: string;
  version?: string | null;
  description?: string | null;
  pipelineId?: string | null;
  createdAt: Date;
}

export interface SdkReleasePipelineViewLike {
  id: string;
  name: string;
  description?: string | null;
  sortOrder?: number | null;
}

export interface SdkReleaseNoteViewLike {
  id: string;
  title?: string | null;
  body?: string | null;
  url: string;
  pipelineId?: string | null;
  releaseIds?: string[] | null;
}

export interface SdkCustomerViewLike {
  id: string;
  name: string;
  externalIds?: string[] | null;
}

function entityId(ref: string): string {
  const trimmed = ref.trim();
  const url = /^https?:\/\//i.test(trimmed) ? new URL(trimmed) : undefined;
  if (url) {
    const segments = url.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? trimmed;
  }
  return trimmed;
}

// ------------------------------------------------------------ initiatives

export interface InitiativeServiceLike {
  listInitiatives(options?: {
    limit?: number;
    cursor?: string;
  }): Promise<PagedResult<InitiativeSummary>>;
  getInitiative(ref: string): Promise<InitiativeSummary>;
  listInitiativeLabels(options?: {
    limit?: number;
    cursor?: string;
  }): Promise<PagedResult<InitiativeLabelSummary>>;
  createInitiative(name: string): Promise<InitiativeSummary>;
  /** Codex parity: create an initiative label (write-gated). */
  createInitiativeLabel(
    name: string,
    options?: { color?: string },
  ): Promise<InitiativeLabelSummary>;
}

export class LinearInitiativeService implements InitiativeServiceLike {
  constructor(private readonly factory: LinearClientFactoryLike) {}

  async listInitiatives(
    options: { limit?: number; cursor?: string } = {},
  ): Promise<PagedResult<InitiativeSummary>> {
    const limit = normalizeLimit(options.limit);
    try {
      const client = (await this.factory.create()) as unknown as {
        initiatives(variables: Record<string, unknown>): Promise<{
          nodes: SdkInitiativeViewLike[];
          pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
        }>;
      };
      const connection = await client.initiatives({
        first: limit,
        after: options.cursor ?? undefined,
      });
      return toPagedResult(connection.nodes.map(mapInitiative), connection.pageInfo);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async getInitiative(ref: string): Promise<InitiativeSummary> {
    try {
      const client = (await this.factory.create()) as unknown as {
        initiative(id: string): Promise<SdkInitiativeViewLike | undefined>;
      };
      const initiative = await client.initiative(entityId(ref));
      if (!initiative) {
        throw LinearConnectorError.notFound("initiative", ref);
      }
      return mapInitiative(initiative);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async listInitiativeLabels(
    options: { limit?: number; cursor?: string } = {},
  ): Promise<PagedResult<InitiativeLabelSummary>> {
    const limit = normalizeLimit(options.limit);
    try {
      const client = (await this.factory.create()) as unknown as {
        initiativeLabels(variables: Record<string, unknown>): Promise<{
          nodes: SdkInitiativeLabelViewLike[];
          pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
        }>;
      };
      const connection = await client.initiativeLabels({
        first: limit,
        after: options.cursor ?? undefined,
      });
      return toPagedResult(
        connection.nodes.map((label) => ({
          id: label.id,
          name: label.name,
          ...(label.color ? { color: label.color } : {}),
        })),
        connection.pageInfo,
      );
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async createInitiative(name: string): Promise<InitiativeSummary> {
    const trimmed = name?.trim();
    if (!trimmed) {
      throw LinearConnectorError.validation("initiative name must not be empty.");
    }
    try {
      const client = (await this.factory.create()) as unknown as {
        createInitiative(input: { name: string }): Promise<{ initiative?: unknown }>;
      };
      const result = await client.createInitiative({ name: trimmed });
      if (!result?.initiative) {
        throw LinearConnectorError.validation("Linear did not return the created initiative.");
      }
      const initiative = (await Promise.resolve(result.initiative)) as SdkInitiativeViewLike;
      return mapInitiative(initiative);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async createInitiativeLabel(
    name: string,
    options: { color?: string } = {},
  ): Promise<InitiativeLabelSummary> {
    const trimmed = name?.trim();
    if (!trimmed) {
      throw LinearConnectorError.validation("label name must not be empty.");
    }
    try {
      const client = (await this.factory.create()) as unknown as {
        createInitiativeLabel(input: Record<string, unknown>): Promise<{
          initiativeLabel?: unknown;
        }>;
      };
      const input: Record<string, unknown> = { name: trimmed };
      if (options.color?.trim()) input.color = options.color.trim();
      const result = await client.createInitiativeLabel(input);
      if (!result?.initiativeLabel) {
        throw LinearConnectorError.validation(
          "Linear did not return the created initiative label.",
        );
      }
      const label = (await Promise.resolve(result.initiativeLabel)) as SdkInitiativeLabelViewLike;
      return {
        id: label.id,
        name: label.name,
        ...(label.color ? { color: label.color } : {}),
      };
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }
}
export function mapInitiative(initiative: SdkInitiativeViewLike): InitiativeSummary {
  return {
    id: initiative.id,
    name: initiative.name,
    url: initiative.url,
    ...(initiative.description ? { description: initiative.description } : {}),
    ...(initiative.status ? { status: initiative.status } : {}),
    createdAt: initiative.createdAt.toISOString(),
    updatedAt: initiative.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------- releases

export interface ReleaseServiceLike {
  listReleases(options?: { limit?: number; cursor?: string }): Promise<PagedResult<ReleaseSummary>>;
  getRelease(ref: string): Promise<ReleaseSummary>;
  listReleasePipelines(options?: {
    limit?: number;
    cursor?: string;
  }): Promise<PagedResult<ReleasePipelineSummary>>;
  listReleaseNotes(options?: {
    limit?: number;
    cursor?: string;
  }): Promise<PagedResult<ReleaseNoteSummary>>;
  getReleaseNote(ref: string): Promise<ReleaseNoteSummary>;
  createRelease(name: string, pipeline: string): Promise<ReleaseSummary>;
}

export class LinearReleaseService implements ReleaseServiceLike {
  constructor(private readonly factory: LinearClientFactoryLike) {}

  async listReleases(
    options: { limit?: number; cursor?: string } = {},
  ): Promise<PagedResult<ReleaseSummary>> {
    const limit = normalizeLimit(options.limit);
    try {
      const client = (await this.factory.create()) as unknown as {
        releases(variables: Record<string, unknown>): Promise<{
          nodes: SdkReleaseViewLike[];
          pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
        }>;
      };
      const connection = await client.releases({
        first: limit,
        after: options.cursor ?? undefined,
      });
      return toPagedResult(connection.nodes.map(mapRelease), connection.pageInfo);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async getRelease(ref: string): Promise<ReleaseSummary> {
    try {
      const client = (await this.factory.create()) as unknown as {
        release(id: string): Promise<SdkReleaseViewLike | undefined>;
      };
      const release = await client.release(entityId(ref));
      if (!release) {
        throw LinearConnectorError.notFound("release", ref);
      }
      return mapRelease(release);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async listReleasePipelines(
    options: { limit?: number; cursor?: string } = {},
  ): Promise<PagedResult<ReleasePipelineSummary>> {
    const limit = normalizeLimit(options.limit);
    try {
      const client = (await this.factory.create()) as unknown as {
        releasePipelines(variables: Record<string, unknown>): Promise<{
          nodes: SdkReleasePipelineViewLike[];
          pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
        }>;
      };
      const connection = await client.releasePipelines({
        first: limit,
        after: options.cursor ?? undefined,
      });
      return toPagedResult(
        connection.nodes.map((pipeline) => ({
          id: pipeline.id,
          name: pipeline.name,
          ...(pipeline.description ? { description: pipeline.description } : {}),
          ...(pipeline.sortOrder !== undefined && pipeline.sortOrder !== null
            ? { sortOrder: pipeline.sortOrder }
            : {}),
        })),
        connection.pageInfo,
      );
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async listReleaseNotes(
    options: { limit?: number; cursor?: string } = {},
  ): Promise<PagedResult<ReleaseNoteSummary>> {
    const limit = normalizeLimit(options.limit);
    try {
      const client = (await this.factory.create()) as unknown as {
        releaseNotes(variables: Record<string, unknown>): Promise<{
          nodes: SdkReleaseNoteViewLike[];
          pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
        }>;
      };
      const connection = await client.releaseNotes({
        first: limit,
        after: options.cursor ?? undefined,
      });
      return toPagedResult(connection.nodes.map(mapReleaseNote), connection.pageInfo);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async getReleaseNote(ref: string): Promise<ReleaseNoteSummary> {
    try {
      const client = (await this.factory.create()) as unknown as {
        releaseNote(id: string): Promise<SdkReleaseNoteViewLike | undefined>;
      };
      const note = await client.releaseNote(entityId(ref));
      if (!note) {
        throw LinearConnectorError.notFound("release note", ref);
      }
      return mapReleaseNote(note);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  /** Create a release; the pipeline (stage) is resolved by name (§14-style
   * bounded scan — no dedicated pipeline resolver exists on the seam). */
  async createRelease(name: string, pipeline: string): Promise<ReleaseSummary> {
    const trimmed = name?.trim();
    const pipelineName = pipeline?.trim();
    if (!trimmed) {
      throw LinearConnectorError.validation("release name must not be empty.");
    }
    if (!pipelineName) {
      throw LinearConnectorError.validation("release pipeline must not be empty.");
    }
    try {
      const client = (await this.factory.create()) as unknown as {
        releasePipelines(variables: { first: number }): Promise<{
          nodes: SdkReleasePipelineViewLike[];
        }>;
        createRelease(input: { name: string; pipelineId: string }): Promise<{
          release?: unknown;
        }>;
      };
      const pipelines = await client.releasePipelines({ first: 100 });
      const pipelineRow = pipelines.nodes.find(
        (candidate) => candidate.name === pipelineName || candidate.id === pipelineName,
      );
      if (!pipelineRow) {
        throw LinearConnectorError.notFound("release pipeline", pipelineName);
      }
      const result = await client.createRelease({
        name: trimmed,
        pipelineId: pipelineRow.id,
      });
      if (!result?.release) {
        throw LinearConnectorError.validation("Linear did not return the created release.");
      }
      const release = (await Promise.resolve(result.release)) as SdkReleaseViewLike;
      return mapRelease(release);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }
}

export function mapRelease(release: SdkReleaseViewLike): ReleaseSummary {
  return {
    id: release.id,
    name: release.name,
    url: release.url,
    ...(release.version ? { version: release.version } : {}),
    ...(release.description ? { description: release.description } : {}),
    ...(release.pipelineId ? { pipelineId: release.pipelineId } : {}),
    createdAt: release.createdAt.toISOString(),
  };
}

export function mapReleaseNote(note: SdkReleaseNoteViewLike): ReleaseNoteSummary {
  return {
    id: note.id,
    ...(note.title ? { title: note.title } : {}),
    ...(note.body ? { body: note.body } : {}),
    url: note.url,
    ...(note.pipelineId ? { pipelineId: note.pipelineId } : {}),
    releaseIds: note.releaseIds ?? [],
  };
}

// --------------------------------------------------------------- customers

export interface CustomerServiceLike {
  listCustomers(options?: {
    limit?: number;
    cursor?: string;
  }): Promise<PagedResult<CustomerSummary>>;
  getCustomer(ref: string): Promise<CustomerSummary>;
  createCustomer(name: string): Promise<CustomerSummary>;
  /** Codex parity: delete a customer by ID (write-gated). */
  deleteCustomer(id: string): Promise<void>;
  /** Codex parity: update a customer name by ID (write-gated). */
  updateCustomer(id: string, name: string): Promise<CustomerSummary>;
  /** Codex parity: archive a customer need by ID (write-gated). */
  deleteCustomerNeed(id: string): Promise<void>;
}

export class LinearCustomerService implements CustomerServiceLike {
  constructor(private readonly factory: LinearClientFactoryLike) {}

  async listCustomers(
    options: { limit?: number; cursor?: string } = {},
  ): Promise<PagedResult<CustomerSummary>> {
    const limit = normalizeLimit(options.limit);
    try {
      const client = (await this.factory.create()) as unknown as {
        customers(variables: Record<string, unknown>): Promise<{
          nodes: SdkCustomerViewLike[];
          pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
        }>;
      };
      const connection = await client.customers({
        first: limit,
        after: options.cursor ?? undefined,
      });
      return toPagedResult(connection.nodes.map(mapCustomer), connection.pageInfo);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async getCustomer(ref: string): Promise<CustomerSummary> {
    try {
      const client = (await this.factory.create()) as unknown as {
        customer(id: string): Promise<SdkCustomerViewLike | undefined>;
      };
      const customer = await client.customer(entityId(ref));
      if (!customer) {
        throw LinearConnectorError.notFound("customer", ref);
      }
      return mapCustomer(customer);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async createCustomer(name: string): Promise<CustomerSummary> {
    const trimmed = name?.trim();
    if (!trimmed) {
      throw LinearConnectorError.validation("customer name must not be empty.");
    }
    try {
      const client = (await this.factory.create()) as unknown as {
        createCustomer(input: { name: string }): Promise<{ customer?: unknown }>;
      };
      const result = await client.createCustomer({ name: trimmed });
      if (!result?.customer) {
        throw LinearConnectorError.validation("Linear did not return the created customer.");
      }
      const customer = (await Promise.resolve(result.customer)) as SdkCustomerViewLike;
      return mapCustomer(customer);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async deleteCustomer(id: string): Promise<void> {
    const trimmed = id?.trim();
    if (!trimmed) {
      throw LinearConnectorError.validation("customer id must not be empty.");
    }
    try {
      const client = (await this.factory.create()) as unknown as {
        deleteCustomer(id: string): Promise<unknown>;
      };
      await client.deleteCustomer(trimmed);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async updateCustomer(id: string, name: string): Promise<CustomerSummary> {
    const trimmed = id?.trim();
    const next = name?.trim();
    if (!trimmed) {
      throw LinearConnectorError.validation("customer id must not be empty.");
    }
    if (!next) {
      throw LinearConnectorError.validation("customer name must not be empty.");
    }
    try {
      const client = (await this.factory.create()) as unknown as {
        updateCustomer(id: string, input: { name: string }): Promise<{ customer?: unknown }>;
      };
      const result = await client.updateCustomer(trimmed, { name: next });
      if (!result?.customer) {
        throw LinearConnectorError.validation("Linear did not return the updated customer.");
      }
      const customer = (await Promise.resolve(result.customer)) as SdkCustomerViewLike;
      return mapCustomer(customer);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async deleteCustomerNeed(id: string): Promise<void> {
    const trimmed = id?.trim();
    if (!trimmed) {
      throw LinearConnectorError.validation("customer need id must not be empty.");
    }
    try {
      const client = (await this.factory.create()) as unknown as {
        deleteCustomerNeed(id: string): Promise<unknown>;
      };
      await client.deleteCustomerNeed(trimmed);
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }
}
export function mapCustomer(customer: SdkCustomerViewLike): CustomerSummary {
  return {
    id: customer.id,
    name: customer.name,
    ...(customer.externalIds && customer.externalIds.length > 0
      ? { externalIds: customer.externalIds }
      : {}),
  };
}
