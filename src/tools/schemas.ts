/**
 * Canonical output schemas for the read tools (plan §9, §13).
 *
 * Written in the dsh-tools ValueSchemaSpec DSL. DSL notes (verified on the
 * target wave, plan §9): object nodes must declare `additionalProperties`
 * explicitly; `required` is a per-property annotation (no root-level
 * required arrays); optional fields are simply properties without
 * `required: true` and may be omitted by the canonical value.
 */
import type { ValueSchemaSpec } from "@deepseek-ai/dsh-tools";

const stringProperty = { type: "string" as const };

export const connectionStatusSchema: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    connected: { type: "boolean", required: true },
    authMode: { type: "string", enum: ["oauth", "apiKey"] },
    // Plugin-internal lifecycle state (plan §50; Milestone 6).
    state: {
      type: "string",
      enum: ["disconnected", "connecting", "connected", "expired", "revoked", "error"],
    },
    actorMode: { type: "string", enum: ["user", "app"] },
    message: stringProperty,
    workspace: {
      type: "object",
      additionalProperties: true,
      properties: {
        id: { type: "string", required: true },
        name: { type: "string", required: true },
      },
    },
    viewer: {
      type: "object",
      additionalProperties: true,
      properties: {
        id: { type: "string", required: true },
        name: { type: "string", required: true },
        email: stringProperty,
      },
    },
  },
};

const actorProperty: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string", required: true },
    name: { type: "string", required: true },
  },
};

export const issueSummarySchema: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string", required: true },
    identifier: { type: "string", required: true },
    title: { type: "string", required: true },
    url: { type: "string", required: true },
    priority: {
      type: "object",
      additionalProperties: true,
      required: true,
      properties: {
        value: { type: "number", required: true },
        label: { type: "string", required: true },
      },
    },
    status: {
      type: "object",
      additionalProperties: true,
      properties: {
        id: { type: "string", required: true },
        name: { type: "string", required: true },
        type: { type: "string", required: true },
      },
    },
    assignee: actorProperty,
    project: {
      type: "object",
      additionalProperties: true,
      properties: {
        id: { type: "string", required: true },
        name: { type: "string", required: true },
      },
    },
    team: {
      type: "object",
      additionalProperties: true,
      required: true,
      properties: {
        id: { type: "string", required: true },
        key: { type: "string", required: true },
        name: { type: "string", required: true },
      },
    },
    labels: {
      type: "array",
      required: true,
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string", required: true },
          name: { type: "string", required: true },
        },
      },
    },
    createdAt: { type: "string", required: true },
    updatedAt: { type: "string", required: true },
  },
};

const cycleProperty: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string", required: true },
    name: { type: "string", required: true },
  },
};

const parentProperty: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    identifier: { type: "string", required: true },
    title: { type: "string", required: true },
  },
};

const relationProperty: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    type: { type: "string", required: true },
    issue: {
      type: "object",
      additionalProperties: true,
      properties: {
        identifier: { type: "string", required: true },
        title: { type: "string", required: true },
      },
    },
  },
};

export const issueDetailSchema: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    ...issueSummarySchema.properties,
    description: stringProperty,
    dueDate: stringProperty,
    cycle: cycleProperty,
    parent: parentProperty,
    relations: {
      type: "array",
      required: true,
      items: relationProperty,
    },
  },
};

/** One comment, as returned by `linear_add_comment` (plan §10.7). */
export const commentSummarySchema: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string", required: true },
    body: { type: "string", required: true },
    author: actorProperty,
    createdAt: { type: "string", required: true },
  },
};

export const issueContextSchema: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    issue: { ...issueDetailSchema, required: true },
    comments: {
      type: "array",
      required: true,
      items: commentSummarySchema,
    },
  },
};

export const searchIssuesResultSchema: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    items: { type: "array", required: true, items: issueSummarySchema },
    hasMore: { type: "boolean", required: true },
    nextCursor: stringProperty,
  },
};

// ------------------------------------------------------- projects / teams / cycles

const teamProperty: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string", required: true },
    key: { type: "string", required: true },
    name: { type: "string", required: true },
  },
};

export const projectSummarySchema: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string", required: true },
    name: { type: "string", required: true },
    url: { type: "string", required: true },
    status: stringProperty,
    lead: actorProperty,
    teams: { type: "array", required: true, items: teamProperty },
    targetDate: stringProperty,
    progress: { type: "number" },
  },
};

export const projectDetailSchema: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    ...projectSummarySchema.properties,
    description: stringProperty,
    recentUpdates: {
      type: "array",
      required: true,
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string", required: true },
          body: { type: "string", required: true },
          createdAt: { type: "string", required: true },
          author: actorProperty,
        },
      },
    },
  },
};

/** Shared paged-result shape for the list tools (plan §33). */
export const pagedResultSchema = (item: ValueSchemaSpec): ValueSchemaSpec => ({
  type: "object",
  additionalProperties: true,
  properties: {
    items: { type: "array", required: true, items: item },
    hasMore: { type: "boolean", required: true },
    nextCursor: stringProperty,
  },
});

export const projectListResultSchema = pagedResultSchema(projectSummarySchema);

/** Signed upload plan (plan §68.1 A). */
export const attachmentUploadPlanSchema: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    assetUrl: { type: "string", required: true },
    uploadUrl: { type: "string", required: true },
    headers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          key: { type: "string", required: true },
          value: { type: "string", required: true },
        },
      },
    },
    filename: { type: "string", required: true },
    contentType: { type: "string", required: true },
    size: { type: "number", required: true },
  },
};

/** Acknowledgment for write tools that mutate without a rich payload. */
export const okSchema: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    ok: { type: "boolean", required: true },
  },
};

/** A workspace user (v0.2 tool batch). */
export const userProperty: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string", required: true },
    name: { type: "string", required: true },
    email: stringProperty,
  },
};

export const userListResultSchema = pagedResultSchema(userProperty);

/** Team details beyond the list summary (v0.2 tool batch). */
export const teamDetailSchema: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string", required: true },
    key: { type: "string", required: true },
    name: { type: "string", required: true },
    displayName: stringProperty,
    issueCount: { type: "number" },
    timezone: stringProperty,
    cyclesEnabled: { type: "boolean" },
    triageEnabled: { type: "boolean" },
  },
};

/** One workflow state (v0.2 tool batch). */
export const workflowStateProperty: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string", required: true },
    name: { type: "string", required: true },
    type: { type: "string", required: true },
    color: stringProperty,
    position: { type: "number" },
  },
};

export const workflowStateListResultSchema = pagedResultSchema(workflowStateProperty);

/** An issue label (v0.2 tool batch). */
export const issueLabelProperty: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string", required: true },
    name: { type: "string", required: true },
    color: stringProperty,
    isGroup: { type: "boolean" },
  },
};

export const issueLabelListResultSchema = pagedResultSchema(issueLabelProperty);

/** A workspace document (v0.2 continuation). */
export const documentProperty: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string", required: true },
    title: { type: "string", required: true },
    url: { type: "string", required: true },
    projectId: stringProperty,
    initiativeId: stringProperty,
    createdAt: { type: "string", required: true },
    updatedAt: { type: "string", required: true },
  },
};

export const documentListResultSchema = pagedResultSchema(documentProperty);

/** A project status update (v0.2 continuation). */
export const statusUpdateProperty: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string", required: true },
    body: { type: "string", required: true },
    createdAt: { type: "string", required: true },
    updatedAt: { type: "string", required: true },
    projectId: stringProperty,
    initiativeId: stringProperty,
    authorName: stringProperty,
  },
};

export const statusUpdateListResultSchema = pagedResultSchema(statusUpdateProperty);

/** A project milestone (v0.2 continuation). */
export const milestoneProperty: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string", required: true },
    name: { type: "string", required: true },
    targetDate: stringProperty,
    description: stringProperty,
    projectId: stringProperty,
  },
};

export const milestoneListResultSchema = pagedResultSchema(milestoneProperty);

/** An initiative (v0.2 continuation). */
export const initiativeProperty: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string", required: true },
    name: { type: "string", required: true },
    url: { type: "string", required: true },
    description: stringProperty,
    status: stringProperty,
    createdAt: { type: "string", required: true },
    updatedAt: { type: "string", required: true },
  },
};

export const initiativeListResultSchema = pagedResultSchema(initiativeProperty);

export const initiativeLabelProperty: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string", required: true },
    name: { type: "string", required: true },
    color: stringProperty,
  },
};

export const initiativeLabelListResultSchema = pagedResultSchema(initiativeLabelProperty);

/** A release (v0.2 continuation). */
export const releaseProperty: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string", required: true },
    name: { type: "string", required: true },
    url: { type: "string", required: true },
    version: stringProperty,
    description: stringProperty,
    pipelineId: stringProperty,
    createdAt: { type: "string", required: true },
  },
};

export const releaseListResultSchema = pagedResultSchema(releaseProperty);

export const releasePipelineProperty: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string", required: true },
    name: { type: "string", required: true },
    description: stringProperty,
    sortOrder: { type: "number" },
  },
};

export const releasePipelineListResultSchema = pagedResultSchema(releasePipelineProperty);

export const releaseNoteProperty: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string", required: true },
    title: stringProperty,
    body: stringProperty,
    url: { type: "string", required: true },
    pipelineId: stringProperty,
    releaseIds: { type: "array", items: { type: "string" } },
  },
};

export const releaseNoteListResultSchema = pagedResultSchema(releaseNoteProperty);

/** A customer (v0.2 continuation). */
export const customerProperty: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string", required: true },
    name: { type: "string", required: true },
    externalIds: { type: "array", items: { type: "string" } },
  },
};

export const customerListResultSchema = pagedResultSchema(customerProperty);

/** Viewer profile (v0.2 continuation). */
export const profileSchema: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string", required: true },
    name: { type: "string", required: true },
    email: stringProperty,
  },
};

/** An attachment (v0.2 tool batch). */
export const attachmentProperty: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string", required: true },
    title: { type: "string", required: true },
    url: { type: "string", required: true },
    sourceType: stringProperty,
    createdAt: { type: "string", required: true },
  },
};

export const attachmentListResultSchema = pagedResultSchema(attachmentProperty);

export const teamListResultSchema = pagedResultSchema(teamProperty);

export const cycleSummarySchema: ValueSchemaSpec = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: "string", required: true },
    name: { type: "string", required: true },
    startsAt: stringProperty,
    endsAt: stringProperty,
    completedAt: stringProperty,
  },
};

export const cycleListResultSchema = pagedResultSchema(cycleSummarySchema);
