/**
 * Issue read-path contract tests (plan §30–§33, §53.2).
 *
 * Mock boundary: the Linear client and the metadata resolver. Fake issues /
 * connections are plain structural objects shaped like the SDK models, so SDK
 * upgrades only touch this file (plan §64). The resolver stub records the
 * name → ID resolution calls so the §32/§14 filter-pushdown contract is
 * asserted end to end.
 */
import { expect, test } from "vite-plus/test";
import { LinearError, LinearErrorType } from "@linear/sdk";
import {
  LinearIssueService,
  buildIssueFilter,
  type IssueMetadata,
} from "../../src/linear/services/issue-service.ts";
import type { LinearClientFactoryLike } from "../../src/linear/client-factory.ts";
import { LinearConnectorError } from "../../src/linear/error.ts";

const ISSUE_DATE = new Date("2026-08-15T10:20:00Z");

function summaryNode(overrides: Record<string, unknown> = {}) {
  return {
    id: "iss_1",
    identifier: "ENG-123",
    title: "Fix login token refresh",
    url: "https://linear.app/acme/issue/ENG-123/Fix-login-token-refresh",
    priority: 2,
    createdAt: ISSUE_DATE,
    updatedAt: ISSUE_DATE,
    description: "Refresh token may expire.",
    dueDate: "2026-09-01",
    labelIds: ["lb_1", "lb_2"],
    stateId: "st_1",
    teamId: "tm_1",
    assigneeId: "us_1",
    projectId: "pr_1",
    cycleId: "cy_1",
    parentId: "iss_0",
    ...overrides,
  };
}

function detailModel(overrides: Record<string, unknown> = {}) {
  return {
    ...summaryNode(),
    state: Promise.resolve({ id: "st_1", name: "In Progress", type: "started" }),
    team: Promise.resolve({ id: "tm_1", key: "ENG", name: "Engineering" }),
    assignee: Promise.resolve({ id: "us_1", name: "Mang", email: "mang@example.com" }),
    project: Promise.resolve({ id: "pr_1", name: "Backend" }),
    cycle: Promise.resolve({ id: "cy_1", name: "Cycle 5" }),
    parent: Promise.resolve({ identifier: "ENG-100", title: "Parent issue" }),
    labels: async () => ({
      nodes: [
        { id: "lb_1", name: "bug" },
        { id: "lb_2", name: "auth" },
      ],
    }),
    relations: async () => ({
      nodes: [
        {
          type: "blocks",
          relatedIssue: Promise.resolve({ identifier: "ENG-200", title: "Target issue" }),
        },
      ],
    }),
    comments: async () => ({ nodes: [] }),
    ...overrides,
  };
}

function catalogNodes() {
  return {
    workflowStates: async () => ({
      nodes: [{ id: "st_1", name: "In Progress", type: "started" }],
    }),
    teams: async () => ({ nodes: [{ id: "tm_1", key: "ENG", name: "Engineering" }] }),
    users: async () => ({ nodes: [{ id: "us_1", name: "Mang", email: "mang@example.com" }] }),
    projects: async () => ({ nodes: [{ id: "pr_1", name: "Backend" }] }),
    cycles: async () => ({ nodes: [{ id: "cy_1", name: "Cycle 5" }] }),
    issueLabels: async () => ({
      nodes: [
        { id: "lb_1", name: "bug" },
        { id: "lb_2", name: "auth" },
      ],
    }),
  };
}

function makeClient(overrides: Record<string, unknown> = {}) {
  const calls: {
    issue: string[];
    issues: unknown[];
    searchIssues: unknown[];
    user: string[];
    team: string[];
  } = {
    issue: [],
    issues: [],
    searchIssues: [],
    user: [],
    team: [],
  };
  // Overrides may be a replacement VALUE or a replacement FUNCTION; both are
  // consulted inside the default method so the SDK surface stays callable.
  const resolved = (value: unknown, args: unknown[]) => {
    if (value === undefined) return undefined;
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown)(...args) : value;
  };
  const client = {
    issue: async (id: string) => {
      calls.issue.push(id);
      if ("issue" in overrides) return resolved(overrides.issue, [id]);
      return detailModel();
    },
    issues: async (variables: unknown) => {
      calls.issues.push(variables);
      return (
        resolved(overrides.issues, [variables]) ?? {
          nodes: [summaryNode()],
          pageInfo: { hasNextPage: false, endCursor: null },
        }
      );
    },
    searchIssues: async (term: string, variables: unknown) => {
      calls.searchIssues.push({ term, variables });
      return (
        resolved(overrides.searchIssues, [term, variables]) ?? {
          nodes: [summaryNode()],
          pageInfo: { hasNextPage: true, endCursor: "cursor-2" },
          totalCount: 3,
        }
      );
    },
    user: async (id: string) => {
      calls.user.push(id);
      return { id, name: "Mang", email: "mang@example.com" };
    },
    team: async (id: string) => {
      calls.team.push(id);
      return {
        id,
        states: async () => ({
          nodes: [{ id: "st_1", name: "In Progress", type: "started" }],
          pageInfo: { hasNextPage: false },
        }),
      };
    },
    ...catalogNodes(),
  };
  return { client, calls };
}

function factoryFor(client: unknown): LinearClientFactoryLike {
  return { create: async () => client as never, clear() {} };
}

/**
 * Metadata resolver stub: resolves every name to the canonical fixture ids
 * and records the calls. The catalog surface reads through the same fake
 * client so result mapping exercises the real catalog path.
 */
function metadataFor(client: unknown) {
  const calls: {
    resolveTeam: string[];
    resolveProject: string[];
    resolveUser: string[];
    resolveWorkflowState: string[];
    resolveLabels: string[][];
  } = {
    resolveTeam: [],
    resolveProject: [],
    resolveUser: [],
    resolveWorkflowState: [],
    resolveLabels: [],
  };
  const c = client as {
    teams(v: { first: number }): Promise<{ nodes: { id: string; key: string; name: string }[] }>;
    users(v: {
      first: number;
    }): Promise<{ nodes: { id: string; name: string; email?: string | null }[] }>;
    projects(v: { first: number }): Promise<{ nodes: { id: string; name: string }[] }>;
    issueLabels(v: { first: number }): Promise<{ nodes: { id: string; name: string }[] }>;
    team(id: string): Promise<
      | {
          id: string;
          states(v: { first: number }): Promise<{
            nodes: { id: string; name: string; type: string }[];
          }>;
        }
      | undefined
    >;
  };
  const metadata: IssueMetadata = {
    resolveTeam: async (ref: string) => {
      calls.resolveTeam.push(ref);
      return { id: "tm_1", key: "ENG", name: "Engineering" };
    },
    resolveProject: async (ref: string) => {
      calls.resolveProject.push(ref);
      return { id: "pr_1", name: "Backend" };
    },
    resolveUser: async (ref: string) => {
      calls.resolveUser.push(ref);
      return { id: "us_1", name: "Mang", email: "mang@example.com" };
    },
    resolveWorkflowState: async (teamId: string, ref: string) => {
      calls.resolveWorkflowState.push(`${teamId}:${ref}`);
      return { id: "st_1", name: "In Progress", type: "started" };
    },
    resolveLabels: async (refs: string[]) => {
      calls.resolveLabels.push(refs);
      return refs.map((ref) => ({ id: `lb_${ref}`, name: ref }));
    },
    catalog: {
      getTeams: async () => (await c.teams({ first: 250 })).nodes,
      getUsers: async () => (await c.users({ first: 250 })).nodes,
      getProjects: async () => (await c.projects({ first: 250 })).nodes,
      getLabels: async () => (await c.issueLabels({ first: 250 })).nodes,
      getStates: async (teamId: string) =>
        (await c.team(teamId))?.states({ first: 250 }).then((connection) => connection.nodes) ?? [],
    },
  };
  return { calls, metadata };
}

function serviceFor(client: unknown, overrides: Record<string, unknown> = {}) {
  const { metadata } = metadataFor(client);
  return new LinearIssueService(factoryFor(client), {
    ...metadata,
    ...overrides,
  } as unknown as IssueMetadata);
}

// ------------------------------------------------------------------ getIssue

test("getIssue resolves by identifier and maps the full detail", async () => {
  const { client, calls } = makeClient();
  const issue = await serviceFor(client).getIssue("eng-123");

  expect(calls.issue).toEqual(["ENG-123"]);
  expect(issue).toEqual({
    id: "iss_1",
    identifier: "ENG-123",
    title: "Fix login token refresh",
    url: "https://linear.app/acme/issue/ENG-123/Fix-login-token-refresh",
    priority: { value: 2, label: "High" },
    status: { id: "st_1", name: "In Progress", type: "started" },
    assignee: { id: "us_1", name: "Mang" },
    project: { id: "pr_1", name: "Backend" },
    team: { id: "tm_1", key: "ENG", name: "Engineering" },
    labels: [
      { id: "lb_1", name: "bug" },
      { id: "lb_2", name: "auth" },
    ],
    createdAt: "2026-08-15T10:20:00.000Z",
    updatedAt: "2026-08-15T10:20:00.000Z",
    description: "Refresh token may expire.",
    dueDate: "2026-09-01",
    cycle: { id: "cy_1", name: "Cycle 5" },
    parent: { identifier: "ENG-100", title: "Parent issue" },
    relations: [{ type: "blocks", issue: { identifier: "ENG-200", title: "Target issue" } }],
  });
});

test("getIssue accepts a Linear URL", async () => {
  const { client, calls } = makeClient();
  await serviceFor(client).getIssue("https://linear.app/acme/issue/ENG-123/some-slug");
  expect(calls.issue).toEqual(["ENG-123"]);
});

test("getIssue maps NOT_FOUND when the issue is absent", async () => {
  const { client } = makeClient({ issue: undefined });
  const error = await serviceFor(client)
    .getIssue("ENG-123")
    .catch((err: unknown) => err);
  expect(error).toBeInstanceOf(LinearConnectorError);
  expect(error).toMatchObject({ code: "NOT_FOUND" });
});

test("getIssue rejects invalid references before touching the SDK", async () => {
  const { client, calls } = makeClient();
  const error = await serviceFor(client)
    .getIssue("not a ref")
    .catch((err: unknown) => err);
  expect(error).toMatchObject({ code: "VALIDATION_ERROR" });
  expect(calls.issue).toEqual([]);
});

test("getIssue normalizes SDK failures", async () => {
  const { client } = makeClient({
    issue: async () => {
      throw new LinearError({}, [], LinearErrorType.AuthenticationError);
    },
  });
  await expect(serviceFor(client).getIssue("ENG-123")).rejects.toMatchObject({
    code: "AUTH_EXPIRED",
  });
});

// ------------------------------------------------------------ getIssueContext

test("getIssueContext aggregates issue detail and comments", async () => {
  const issue = detailModel({
    comments: async () => ({
      nodes: [
        { id: "c_1", body: "First comment", createdAt: ISSUE_DATE, userId: "us_1" },
        { id: "c_2", body: "Second comment", createdAt: ISSUE_DATE, userId: "us_1" },
      ],
    }),
  });
  const { client: clientWithComments, calls } = makeClient({ issue });
  const context = await serviceFor(clientWithComments).getIssueContext("ENG-123");

  expect(context.issue.identifier).toBe("ENG-123");
  expect(context.comments).toEqual([
    {
      id: "c_1",
      body: "First comment",
      author: { id: "us_1", name: "Mang" },
      createdAt: "2026-08-15T10:20:00.000Z",
    },
    {
      id: "c_2",
      body: "Second comment",
      author: { id: "us_1", name: "Mang" },
      createdAt: "2026-08-15T10:20:00.000Z",
    },
  ]);
  // Authors come from the shared cached users catalog (§14.2) — no per-author
  // user() lookups, no N+1.
  expect(calls.user).toEqual([]);
});

test("getIssueContext clamps commentsLimit to [1, 50]", async () => {
  const requested: number[] = [];
  const issue = detailModel({
    comments: async (variables: { first: number }) => {
      requested.push(variables.first);
      return { nodes: [{ id: "c_1", body: "x", createdAt: ISSUE_DATE, userId: "us_1" }] };
    },
  });
  const { client } = makeClient({ issue });
  await serviceFor(client).getIssueContext("ENG-123", { commentsLimit: 500 });
  await serviceFor(client).getIssueContext("ENG-123");
  expect(requested).toEqual([50, 20]);
});

// ------------------------------------------------------------- searchIssues

test("searchIssues without filters lists recent issues and maps summaries", async () => {
  const { client, calls } = makeClient();
  const result = await serviceFor(client).searchIssues({});

  expect(calls.issues).toEqual([{ filter: undefined, after: undefined, first: 20 }]);
  expect(calls.searchIssues).toEqual([]);
  expect(result).toEqual({
    items: [
      {
        id: "iss_1",
        identifier: "ENG-123",
        title: "Fix login token refresh",
        url: "https://linear.app/acme/issue/ENG-123/Fix-login-token-refresh",
        priority: { value: 2, label: "High" },
        status: { id: "st_1", name: "In Progress", type: "started" },
        assignee: { id: "us_1", name: "Mang" },
        project: { id: "pr_1", name: "Backend" },
        team: { id: "tm_1", key: "ENG", name: "Engineering" },
        labels: [
          { id: "lb_1", name: "bug" },
          { id: "lb_2", name: "auth" },
        ],
        createdAt: "2026-08-15T10:20:00.000Z",
        updatedAt: "2026-08-15T10:20:00.000Z",
      },
    ],
    hasMore: false,
    nextCursor: undefined,
  });
});

test("searchIssues resolves names to IDs through the resolver, then pushes ID filters down", async () => {
  const { client, calls } = makeClient();
  const { metadata, calls: metaCalls } = metadataFor(client);
  const service = new LinearIssueService(factoryFor(client), metadata);

  const result = await service.searchIssues({
    query: "  token refresh  ",
    team: "Engineering",
    project: "Backend",
    assignee: "mang@example.com",
    status: "In Progress",
  });

  expect(metaCalls.resolveTeam).toEqual(["Engineering"]);
  expect(metaCalls.resolveProject).toEqual(["Backend"]);
  expect(metaCalls.resolveUser).toEqual(["mang@example.com"]);
  expect(metaCalls.resolveWorkflowState).toEqual(["tm_1:In Progress"]);
  expect(calls.searchIssues).toEqual([
    {
      term: "token refresh",
      variables: {
        filter: {
          team: { id: { eq: "tm_1" } },
          project: { id: { eq: "pr_1" } },
          assignee: { id: { eq: "us_1" } },
          state: { id: { eq: "st_1" } },
        },
        after: undefined,
        first: 20,
      },
    },
  ]);
  expect(calls.issues).toEqual([]);
  expect(result.hasMore).toBe(true);
  expect(result.nextCursor).toBe("cursor-2");
});

test("searchIssues keeps status without team context name-based", async () => {
  const { client, calls } = makeClient();
  const { metadata, calls: metaCalls } = metadataFor(client);
  const service = new LinearIssueService(factoryFor(client), metadata);

  await service.searchIssues({ status: "In Progress" });

  expect(metaCalls.resolveWorkflowState).toEqual([]);
  expect(calls.issues[0]).toMatchObject({
    filter: { state: { name: { eqIgnoreCase: "In Progress" } } },
  });
});

test("searchIssues surfaces ambiguous names before querying", async () => {
  const { client, calls } = makeClient();
  const service = serviceFor(client, {
    resolveTeam: async () => {
      throw LinearConnectorError.ambiguous("team", "Backend", ["Backend", "backend"]);
    },
  });

  await expect(service.searchIssues({ team: "Backend" })).rejects.toMatchObject({
    code: "AMBIGUOUS_REFERENCE",
  });
  expect(calls.issues).toEqual([]);
  expect(calls.searchIssues).toEqual([]);
});

test("searchIssues surfaces unknown names as NOT_FOUND", async () => {
  const { client, calls } = makeClient();
  const service = serviceFor(client, {
    resolveUser: async () => {
      throw LinearConnectorError.notFound("user", "ghost@example.com");
    },
  });

  await expect(service.searchIssues({ assignee: "ghost@example.com" })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect(calls.issues).toEqual([]);
});

test("buildIssueFilter pushes every resolved filter down to Linear", () => {
  const filter = buildIssueFilter({
    teamId: "tm_1",
    projectId: "pr_1",
    assigneeId: "us_1",
    stateId: "st_1",
    priority: "high",
    labels: ["bug", "auth"],
    cycleName: "Cycle 5",
    includeCompleted: false,
  });
  expect(filter).toEqual({
    team: { id: { eq: "tm_1" } },
    project: { id: { eq: "pr_1" } },
    assignee: { id: { eq: "us_1" } },
    state: { id: { eq: "st_1" } },
    priority: { eq: 2 },
    labels: { every: { name: { in: ["bug", "auth"] } } },
    cycle: { name: { eqIgnoreCase: "Cycle 5" } },
    completedAt: { null: true },
  });
});

test("buildIssueFilter keeps name-based fallbacks for status without team and cycles", () => {
  expect(buildIssueFilter({ statusName: "In Progress" })).toEqual({
    state: { name: { eqIgnoreCase: "In Progress" } },
  });
  expect(buildIssueFilter({ cycleName: "Cycle 5" })).toEqual({
    cycle: { name: { eqIgnoreCase: "Cycle 5" } },
  });
});

test("buildIssueFilter returns undefined for an empty query", () => {
  expect(buildIssueFilter({})).toBeUndefined();
});

test("searchIssues clamps limit to the [1, 50] window", async () => {
  const { client, calls } = makeClient();
  await serviceFor(client).searchIssues({ limit: 500 });
  await serviceFor(client).searchIssues({ limit: 0 });
  expect(calls.issues[0]).toMatchObject({ first: 50 });
  expect(calls.issues[1]).toMatchObject({ first: 1 });
});

test("searchIssues forwards the cursor", async () => {
  const { client, calls } = makeClient();
  await serviceFor(client).searchIssues({ cursor: "cursor-9" });
  expect(calls.issues[0]).toMatchObject({ after: "cursor-9" });
});

test("searchIssues normalizes SDK failures", async () => {
  const { client } = makeClient({
    issues: async () => {
      throw new LinearError({}, [], LinearErrorType.Ratelimited);
    },
  });
  await expect(serviceFor(client).searchIssues({})).rejects.toMatchObject({
    code: "RATE_LIMITED",
  });
});
