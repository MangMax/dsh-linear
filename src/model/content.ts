/**
 * Content-entity canonical models (plan §12, §68 — documents, status
 * updates, milestones). Dates are ISO strings; nested entities are
 * id summaries — the model never sees SDK objects.
 */

/** A workspace document (knowledge base / project doc). */
export interface DocumentSummary {
  id: string;
  title: string;
  url: string;
  projectId?: string;
  initiativeId?: string;
  createdAt: string;
  updatedAt: string;
}

/** A project (or initiative) status update. */
export interface StatusUpdateSummary {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  projectId?: string;
  initiativeId?: string;
  /** Author name when resolvable from the users catalog. */
  authorName?: string;
}

/** A milestone in a project. */
export interface MilestoneSummary {
  id: string;
  name: string;
  targetDate?: string;
  description?: string;
  projectId?: string;
}

/** An initiative (v0.2 continuation). */
export interface InitiativeSummary {
  id: string;
  name: string;
  url: string;
  description?: string;
  status?: string;
  createdAt: string;
  updatedAt: string;
}

/** An initiative label. */
export interface InitiativeLabelSummary {
  id: string;
  name: string;
  color?: string;
}

/** A release (v0.2 continuation). */
export interface ReleaseSummary {
  id: string;
  name: string;
  url: string;
  version?: string;
  description?: string;
  pipelineId?: string;
  createdAt: string;
}

/** A release pipeline (stage). */
export interface ReleasePipelineSummary {
  id: string;
  name: string;
  description?: string;
  sortOrder?: number;
}

/** A release note. */
export interface ReleaseNoteSummary {
  id: string;
  title?: string;
  body?: string;
  url: string;
  pipelineId?: string;
  releaseIds: string[];
}

/** A customer organization (v0.2 continuation). */
export interface CustomerSummary {
  id: string;
  name: string;
  externalIds?: string[];
}
