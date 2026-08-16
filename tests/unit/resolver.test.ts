/**
 * Metadata resolver unit tests (plan §14, §53.1).
 *
 * Covers the §14.1 match priority chain, ambiguity / not-found errors,
 * project reference parsing, and the §14.2 catalog cache (TTL expiry,
 * single-flight, failures not cached). The catalog is exercised against a
 * fake Linear client so no SDK or network is involved.
 */
import { expect, test } from "vite-plus/test";
import {
  LinearMetadataCatalog,
  METADATA_CACHE_TTL_MS,
  CATALOG_PAGE_SIZE,
} from "../../src/linear/resolver/catalog.ts";
import {
  LinearMetadataResolver,
  LinearProjectResolver,
  parseProjectReference,
} from "../../src/linear/resolver/index.ts";
import { LinearConnectorError } from "../../src/linear/error.ts";
import type { LinearClientFactoryLike } from "../../src/linear/client-factory.ts";
import type { LinearSdkModel } from "../../src/linear/sdk-model.ts";

const TEAMS = [
  { id: "tm_1", key: "ENG", name: "Engineering" },
  { id: "tm_2", key: "BK", name: "Backend" },
  { id: "tm_3", key: "BKP", name: "Backend Platform" },
  { id: "tm_4", key: "API", name: "  api  platform " },
  { id: "tm_5", key: "SALE", name: "Sales" },
  { id: "tm_6", key: "BPT", name: "backend" },
];

const USERS = [
  { id: "us_1", name: "Mang", email: "mang@example.com" },
  { id: "us_2", name: "Alex Chen", email: "alex@example.com" },
  { id: "us_3", name: "Alex Liu", email: "alexl@example.com" },
  { id: "us_4", name: "Alex", email: "alex2@example.com" },
  { id: "us_5", name: "Alex", email: "alex3@example.com" },
];

const STATES_ENG = [
  { id: "st_1", name: "In Progress", type: "started" },
  { id: "st_2", name: "Backlog", type: "backlog" },
  { id: "st_3", name: "Todo", type: "unstarted" },
];

function fakeClient(overrides: Record<string, unknown> = {}): LinearSdkModel {
  return {
    teams: async () => ({ nodes: TEAMS, pageInfo: { hasNextPage: false } }),
    projects: async () => ({ nodes: [], pageInfo: { hasNextPage: false } }),
    users: async () => ({ nodes: USERS, pageInfo: { hasNextPage: false } }),
    issueLabels: async () => ({ nodes: [], pageInfo: { hasNextPage: false } }),
    team: async (id: string) =>
      id === "tm_1"
        ? { id, states: async () => ({ nodes: STATES_ENG, pageInfo: { hasNextPage: false } }) }
        : undefined,
    ...overrides,
  } as unknown as LinearSdkModel;
}

function makeResolver(client: LinearSdkModel = fakeClient()) {
  const factory: LinearClientFactoryLike = { create: async () => client as never, clear() {} };
  const catalog = new LinearMetadataCatalog(factory);
  return { catalog, resolver: new LinearMetadataResolver(catalog) };
}

// ------------------------------------------------------------- match priority

test("resolveTeam matches exact ID first, even when a name collides", async () => {
  const { resolver } = makeResolver();
  const hit = await resolver.resolveTeam("tm_1");
  expect(hit).toEqual({ id: "tm_1", key: "ENG", name: "Engineering" });
});

test("resolveTeam matches the key before the name", async () => {
  const { resolver } = makeResolver();
  // "BK" is a key, not a name; "Sales" is a name, not a key.
  expect((await resolver.resolveTeam("BK")).id).toBe("tm_2");
  expect((await resolver.resolveTeam("ENG")).id).toBe("tm_1");
  expect((await resolver.resolveTeam("Sales")).id).toBe("tm_5");
});

test("resolveTeam falls through exact name → case-insensitive → normalized", async () => {
  const { resolver } = makeResolver();
  expect((await resolver.resolveTeam("Engineering")).id).toBe("tm_1");
  expect((await resolver.resolveTeam("SALES")).id).toBe("tm_5");
  // "api  platform" (double space) only matches after normalization.
  expect((await resolver.resolveTeam("  Api   Platform ")).id).toBe("tm_4");
});

test("resolveTeam raises AMBIGUOUS_REFERENCE for case-insensitive name collisions and lists candidates", async () => {
  const { resolver } = makeResolver();
  // "BACKEND" matches both "Backend" (tm_2) and "backend" (tm_6).
  const error = await resolver.resolveTeam("BACKEND").catch((err: unknown) => err);
  expect(error).toBeInstanceOf(LinearConnectorError);
  expect(error).toMatchObject({ code: "AMBIGUOUS_REFERENCE" });
  expect(String((error as Error).message)).toContain("Backend");
  expect(String((error as Error).message)).toContain("backend");
  expect(String((error as Error).message)).not.toContain("Backend Platform");
});

test("resolveTeam raises NOT_FOUND for unknown references", async () => {
  const { resolver } = makeResolver();
  await expect(resolver.resolveTeam("Design")).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("resolveUser matches by email, name, and rejects ambiguous names", async () => {
  const { resolver } = makeResolver();
  expect((await resolver.resolveUser("mang@example.com")).id).toBe("us_1");
  expect((await resolver.resolveUser("Mang")).id).toBe("us_1");
  expect((await resolver.resolveUser("Alex Chen")).id).toBe("us_2");
  // Two users are literally named "Alex" → never guess.
  await expect(resolver.resolveUser("Alex")).rejects.toMatchObject({ code: "AMBIGUOUS_REFERENCE" });
});

test("resolveWorkflowState is scoped to the team's own states", async () => {
  const { resolver } = makeResolver();
  const hit = await resolver.resolveWorkflowState("tm_1", "in progress");
  expect(hit).toEqual({ id: "st_1", name: "In Progress", type: "started" });
  // Unknown team → empty catalog → NOT_FOUND (never a cross-team guess).
  await expect(resolver.resolveWorkflowState("tm_404", "In Progress")).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});

test("resolveLabels resolves every ref and surfaces the first failure", async () => {
  const client = fakeClient({
    issueLabels: async () => ({
      nodes: [
        { id: "lb_1", name: "bug" },
        { id: "lb_2", name: "auth" },
      ],
      pageInfo: { hasNextPage: false },
    }),
  });
  const { resolver } = makeResolver(client);
  expect(await resolver.resolveLabels(["bug", "auth"])).toEqual([
    { id: "lb_1", name: "bug" },
    { id: "lb_2", name: "auth" },
  ]);
  await expect(resolver.resolveLabels(["bug", "nope"])).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});

// -------------------------------------------------------- project references

test("parseProjectReference accepts IDs, URLs and plain names", () => {
  expect(parseProjectReference("abcdef1234567890")).toEqual({
    kind: "id",
    value: "abcdef1234567890",
  });
  expect(parseProjectReference("https://linear.app/acme/project/abcdef1234567890/Backend")).toEqual(
    {
      kind: "id",
      value: "abcdef1234567890",
    },
  );
  expect(
    parseProjectReference("https://linear.app/acme/project/Backend%20Platform/Backend"),
  ).toEqual({
    kind: "name",
    value: "Backend Platform",
  });
  expect(parseProjectReference("Backend")).toEqual({ kind: "name", value: "Backend" });
});

test("parseProjectReference rejects empty input", () => {
  expect(() => parseProjectReference("  ")).toThrowError(LinearConnectorError);
});

test("LinearProjectResolver resolves names via the catalog and IDs against it", async () => {
  const client = fakeClient({
    projects: async () => ({
      nodes: [
        { id: "pr_1", name: "Backend" },
        { id: "pr_2", name: "Frontend" },
      ],
      pageInfo: { hasNextPage: false },
    }),
  });
  const factory: LinearClientFactoryLike = { create: async () => client as never, clear() {} };
  const resolver = new LinearProjectResolver(new LinearMetadataCatalog(factory));
  expect(await resolver.resolveProject("Frontend")).toEqual({ id: "pr_2", name: "Frontend" });
  expect(await resolver.resolveProject("pr_1")).toEqual({ id: "pr_1", name: "Backend" });
  await expect(resolver.resolveProject("pr_zz")).rejects.toMatchObject({ code: "NOT_FOUND" });
});

// ---------------------------------------------------------------- cache (14.2)

test("catalog caches workspace entities for the TTL", async () => {
  let teamFetches = 0;
  const client = fakeClient({
    teams: async () => {
      teamFetches += 1;
      return { nodes: TEAMS, pageInfo: { hasNextPage: false } };
    },
  });
  const factory: LinearClientFactoryLike = { create: async () => client as never, clear() {} };
  const catalog = new LinearMetadataCatalog(factory);

  await catalog.getTeams();
  await catalog.getTeams();
  await Promise.all([catalog.getTeams(), catalog.getTeams()]);
  expect(teamFetches).toBe(1);

  // After the TTL elapses the catalog is re-fetched exactly once.
  let now = 1_000;
  const clocked = new LinearMetadataCatalog(factory, { ttlMs: 5, now: () => now });
  await clocked.getTeams(); // fetch
  await clocked.getTeams(); // cached
  expect(teamFetches).toBe(2);
  now = 1_006; // now - loadedAt = 6 > ttl 5 → expired
  await clocked.getTeams(); // fetch again
  await clocked.getTeams(); // cached
  expect(teamFetches).toBe(3);
});

test("catalog pages connections to exhaustion", async () => {
  const pages = [
    { nodes: TEAMS.slice(0, 1), pageInfo: { hasNextPage: true, endCursor: "c1" } },
    { nodes: TEAMS.slice(1), pageInfo: { hasNextPage: false } },
  ];
  let page = 0;
  const client = fakeClient({
    teams: async () => pages[page++],
  });
  const factory: LinearClientFactoryLike = { create: async () => client as never, clear() {} };
  const catalog = new LinearMetadataCatalog(factory);
  const teams = await catalog.getTeams();
  expect(teams).toHaveLength(TEAMS.length);
  expect(page).toBe(2);
  expect(teams[0]).toEqual({ id: "tm_1", key: "ENG", name: "Engineering" });
});

test("catalog pages per-team states and caches them per team", async () => {
  let stateFetches = 0;
  const client = fakeClient({
    team: async () => {
      stateFetches += 1;
      return {
        id: "tm_1",
        states: async () => ({ nodes: STATES_ENG, pageInfo: { hasNextPage: false } }),
      };
    },
  });
  const factory: LinearClientFactoryLike = { create: async () => client as never, clear() {} };
  const catalog = new LinearMetadataCatalog(factory);
  await catalog.getStates("tm_1");
  await catalog.getStates("tm_1");
  await Promise.all([catalog.getStates("tm_1"), catalog.getStates("tm_1")]);
  expect(stateFetches).toBe(1);
});

test("failed catalog loads are not cached", async () => {
  let calls = 0;
  const client = fakeClient({
    teams: async () => {
      calls += 1;
      if (calls === 1) throw new Error("boom");
      return { nodes: TEAMS, pageInfo: { hasNextPage: false } };
    },
  });
  const factory: LinearClientFactoryLike = { create: async () => client as never, clear() {} };
  const catalog = new LinearMetadataCatalog(factory);
  await expect(catalog.getTeams()).rejects.toThrow("boom");
  expect(await catalog.getTeams()).toHaveLength(TEAMS.length);
  expect(calls).toBe(2);
});

test("CATALOG_PAGE_SIZE and METADATA_CACHE_TTL_MS match the plan", () => {
  expect(CATALOG_PAGE_SIZE).toBe(100);
  expect(METADATA_CACHE_TTL_MS).toBe(5 * 60_000);
});

// ------------------------------------------------ ambiguous message content

test("ambiguous errors carry the candidates list", async () => {
  const { resolver } = makeResolver();
  const error = await resolver.resolveTeam("BACKEND").catch((err: unknown) => err);
  expect(error).toBeInstanceOf(LinearConnectorError);
  expect(String((error as Error).message)).toContain("Candidates:");
  expect(String((error as Error).message)).toContain("- Backend");
  expect(String((error as Error).message)).toContain("- backend");
});
