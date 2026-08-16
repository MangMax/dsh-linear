/**
 * Project service contract tests (plan §10.8, §10.9, §53.2).
 *
 * Mock boundary: the Linear client (fake structural SDK models) and the
 * resolvers. Verifies filter pushdown (accessibleTeams by resolved team id,
 * status name, name containsIgnoreCase), reference parsing (name / ID / URL)
 * and the bounded recent-updates window.
 */
import { expect, test } from "vite-plus/test";
import { LinearError, LinearErrorType } from "@linear/sdk";
import {
  LinearProjectService,
  mapProjectDetail,
  mapProjectSummary,
  type SdkProjectViewLike,
} from "../../src/linear/services/project-service.ts";
import type { LinearClientFactoryLike } from "../../src/linear/client-factory.ts";
import type { ProjectResolver } from "../../src/linear/resolver/project.ts";
import type { TeamResolver } from "../../src/linear/resolver/team.ts";
import { LinearConnectorError } from "../../src/linear/error.ts";

const DATE = new Date("2026-08-15T10:20:00Z");

function projectNode(overrides: Record<string, unknown> = {}): SdkProjectViewLike {
  return {
    id: "pr_1",
    name: "Backend",
    url: "https://linear.app/acme/project/pr_1/Backend",
    progress: 0.42,
    description: "Platform rewrite.",
    state: "started",
    status: Promise.resolve({ id: "ps_1", name: "In Progress" }),
    lead: Promise.resolve({ id: "us_1", name: "Mang" }),
    targetDate: "2026-12-31",
    teams: async () => ({
      nodes: [{ id: "tm_1", key: "ENG", name: "Engineering" }],
    }),
    projectUpdates: async () => ({
      nodes: [
        {
          id: "up_1",
          body: "On track.",
          createdAt: DATE,
          user: Promise.resolve({ id: "us_1", name: "Mang" }),
        },
      ],
    }),
    ...overrides,
  };
}

function makeClient(overrides: Record<string, unknown> = {}) {
  const calls: { projects: unknown[]; project: string[] } = { projects: [], project: [] };
  const client = {
    projects: async (variables: unknown) => {
      calls.projects.push(variables);
      if ("projects" in overrides)
        return (overrides.projects as (...a: unknown[]) => unknown)(variables);
      return {
        nodes: [projectNode()],
        pageInfo: { hasNextPage: false },
      };
    },
    project: async (id: string) => {
      calls.project.push(id);
      if ("project" in overrides) return (overrides.project as (...a: unknown[]) => unknown)(id);
      return projectNode();
    },
  };
  return { client, calls };
}

function resolverFor(overrides: Record<string, unknown> = {}) {
  const calls: { resolveProject: string[]; resolveTeam: string[] } = {
    resolveProject: [],
    resolveTeam: [],
  };
  return {
    calls,
    projects: {
      resolveProject: async (ref: string) => {
        calls.resolveProject.push(ref);
        if ("resolveProject" in overrides) {
          return (overrides.resolveProject as (...a: unknown[]) => unknown)(ref);
        }
        return { id: "pr_1", name: "Backend" };
      },
    },
    teams: {
      resolveTeam: async (ref: string) => {
        calls.resolveTeam.push(ref);
        if ("resolveTeam" in overrides) {
          return (overrides.resolveTeam as (...a: unknown[]) => unknown)(ref);
        }
        return { id: "tm_1", key: "ENG", name: "Engineering" };
      },
    },
  };
}

function serviceFor(client: unknown, resolverOverrides: Record<string, unknown> = {}) {
  const factory: LinearClientFactoryLike = { create: async () => client as never, clear() {} };
  const resolvers = resolverFor(resolverOverrides);
  const service = new LinearProjectService(
    factory,
    resolvers.projects as unknown as ProjectResolver,
    resolvers.teams as unknown as TeamResolver,
  );
  return { service, calls: resolvers.calls };
}

// ------------------------------------------------------------- listProjects

test("listProjects without filters lists summaries and maps nested names", async () => {
  const { client, calls } = makeClient();
  const { service } = serviceFor(client);
  const result = await service.listProjects();

  expect(calls.projects).toEqual([{ filter: undefined, first: 20, after: undefined }]);
  expect(result).toEqual({
    items: [
      {
        id: "pr_1",
        name: "Backend",
        url: "https://linear.app/acme/project/pr_1/Backend",
        status: "In Progress",
        lead: { id: "us_1", name: "Mang" },
        teams: [{ id: "tm_1", key: "ENG", name: "Engineering" }],
        targetDate: "2026-12-31",
        progress: 42,
      },
    ],
    hasMore: false,
    nextCursor: undefined,
  });
});

test("listProjects resolves team to an ID and pushes every filter down", async () => {
  const { client, calls } = makeClient();
  const { service, calls: resolverCalls } = serviceFor(client);
  await service.listProjects({ team: "Engineering", state: "In Progress", query: "  backend  " });

  expect(resolverCalls.resolveTeam).toEqual(["Engineering"]);
  expect(calls.projects[0]).toMatchObject({
    filter: {
      accessibleTeams: { some: { id: { eq: "tm_1" } } },
      status: { name: { eqIgnoreCase: "In Progress" } },
      name: { containsIgnoreCase: "backend" },
    },
  });
});

test("listProjects clamps limit and forwards the cursor", async () => {
  const { client, calls } = makeClient();
  const { service } = serviceFor(client);
  await service.listProjects({ limit: 500 });
  await service.listProjects({ limit: 0, cursor: "cursor-9" });
  expect(calls.projects[0]).toMatchObject({ first: 50 });
  expect(calls.projects[1]).toMatchObject({ first: 1, after: "cursor-9" });
});

test("listProjects surfaces ambiguous team names", async () => {
  const { client } = makeClient();
  const { service } = serviceFor(client, {
    resolveTeam: async () => {
      throw LinearConnectorError.ambiguous("team", "Backend", ["Backend", "backend"]);
    },
  });
  await expect(service.listProjects({ team: "Backend" })).rejects.toMatchObject({
    code: "AMBIGUOUS_REFERENCE",
  });
});

test("listProjects normalizes SDK failures", async () => {
  const { client } = makeClient({
    projects: async () => {
      throw new LinearError({}, [], LinearErrorType.Ratelimited);
    },
  });
  const { service } = serviceFor(client);
  await expect(service.listProjects()).rejects.toMatchObject({ code: "RATE_LIMITED" });
});

// -------------------------------------------------------------- getProject

test("getProject resolves a name through the resolver then fetches the detail", async () => {
  const { client, calls } = makeClient();
  const { service, calls: resolverCalls } = serviceFor(client);
  const detail = await service.getProject("Backend");

  expect(resolverCalls.resolveProject).toEqual(["Backend"]);
  expect(calls.project).toEqual(["pr_1"]);
  expect(detail).toMatchObject({
    id: "pr_1",
    name: "Backend",
    description: "Platform rewrite.",
    status: "In Progress",
    progress: 42,
    recentUpdates: [
      {
        id: "up_1",
        body: "On track.",
        createdAt: "2026-08-15T10:20:00.000Z",
        author: { id: "us_1", name: "Mang" },
      },
    ],
  });
});

test("getProject accepts an ID directly without the resolver", async () => {
  const { client, calls } = makeClient();
  const { service, calls: resolverCalls } = serviceFor(client);
  await service.getProject("abcdef1234567890");
  expect(resolverCalls.resolveProject).toEqual([]);
  expect(calls.project).toEqual(["abcdef1234567890"]);
});

test("getProject accepts a Linear project URL with an id segment", async () => {
  const { client, calls } = makeClient();
  const { service, calls: resolverCalls } = serviceFor(client);
  await service.getProject("https://linear.app/acme/project/abcdef1234567890/Backend");
  expect(resolverCalls.resolveProject).toEqual([]);
  expect(calls.project).toEqual(["abcdef1234567890"]);
});

test("getProject maps NOT_FOUND when the project is absent", async () => {
  const { client } = makeClient({
    project: async () => undefined,
  });
  const { service } = serviceFor(client);
  await expect(service.getProject("Backend")).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("getProject rejects invalid references before touching the SDK", async () => {
  const { client, calls } = makeClient();
  const { service } = serviceFor(client);
  await expect(service.getProject("   ")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  expect(calls.project).toEqual([]);
});

test("getProject caps recent updates at 5", async () => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    id: `up_${i}`,
    body: `update ${i}`,
    createdAt: DATE,
    user: undefined,
  }));
  const { client } = makeClient({
    project: async () => projectNode({ projectUpdates: async () => ({ nodes: many }) }),
  });
  const { service } = serviceFor(client);
  const detail = await service.getProject("Backend");
  expect(detail.recentUpdates).toHaveLength(5);
});

test("getProject normalizes SDK failures", async () => {
  const { client } = makeClient({
    project: async () => {
      throw new LinearError({}, [], LinearErrorType.Forbidden);
    },
  });
  const { service } = serviceFor(client);
  await expect(service.getProject("Backend")).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
});

// ---------------------------------------------------------- pure mapping

test("mapProjectSummary clamps progress into 0..100 percent", async () => {
  expect((await mapProjectSummary(projectNode({ progress: 0 }))).progress).toBe(0);
  expect((await mapProjectSummary(projectNode({ progress: 1 }))).progress).toBe(100);
  expect((await mapProjectSummary(projectNode({ progress: 0.425 }))).progress).toBe(43);
  expect((await mapProjectSummary(projectNode({ progress: -1 }))).progress).toBe(0);
  expect((await mapProjectSummary(projectNode({ progress: 2 }))).progress).toBe(100);
  expect((await mapProjectSummary(projectNode({ progress: null }))).progress).toBeUndefined();
});

test("mapProjectSummary handles eager (non-promise) nested models", async () => {
  const node = projectNode({
    status: { id: "ps_1", name: "Planned" },
    lead: { id: "us_1", name: "Mang" },
  });
  const summary = await mapProjectSummary(node);
  expect(summary.status).toBe("Planned");
  expect(summary.lead).toEqual({ id: "us_1", name: "Mang" });
});

test("mapProjectDetail omits recent-update authors that are absent", async () => {
  const node = projectNode({
    projectUpdates: async () => ({
      nodes: [{ id: "up_1", body: "x", createdAt: DATE, user: null }],
    }),
  });
  const detail = await mapProjectDetail(node);
  expect(detail.recentUpdates).toEqual([
    { id: "up_1", body: "x", createdAt: "2026-08-15T10:20:00.000Z", author: undefined },
  ]);
});
