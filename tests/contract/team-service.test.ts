/**
 * Team service contract tests (plan §10.10, §53.2).
 *
 * Mock boundary: the Linear client (fake structural SDK models).
 */
import { expect, test } from "vite-plus/test";
import { LinearError, LinearErrorType } from "@linear/sdk";
import { LinearTeamService } from "../../src/linear/services/team-service.ts";
import type { LinearClientFactoryLike } from "../../src/linear/client-factory.ts";

function makeClient(overrides: Record<string, unknown> = {}) {
  const calls: { teams: unknown[] } = { teams: [] };
  const client = {
    teams: async (variables: unknown) => {
      calls.teams.push(variables);
      if ("teams" in overrides) return (overrides.teams as (...a: unknown[]) => unknown)(variables);
      return {
        nodes: [
          { id: "tm_1", key: "ENG", name: "Engineering" },
          { id: "tm_2", key: "BK", name: "Backend" },
        ],
        pageInfo: { hasNextPage: true, endCursor: "cursor-2" },
      };
    },
  };
  return { client, calls };
}

function serviceFor(client: unknown) {
  const factory: LinearClientFactoryLike = { create: async () => client as never, clear() {} };
  return new LinearTeamService(factory, {
    resolveTeam: async () => ({ id: "tm_1", key: "ENG", name: "Engineering" }),
  } as never);
}

test("listTeams maps nodes and pagination", async () => {
  const { client, calls } = makeClient();
  const result = await serviceFor(client).listTeams();

  expect(calls.teams).toEqual([{ first: 20, after: undefined }]);
  expect(result).toEqual({
    items: [
      { id: "tm_1", key: "ENG", name: "Engineering" },
      { id: "tm_2", key: "BK", name: "Backend" },
    ],
    hasMore: true,
    nextCursor: "cursor-2",
  });
});

test("listTeams clamps limit and forwards the cursor", async () => {
  const { client, calls } = makeClient();
  await serviceFor(client).listTeams({ limit: 500 });
  await serviceFor(client).listTeams({ limit: 0, cursor: "cursor-9" });
  expect(calls.teams[0]).toMatchObject({ first: 50 });
  expect(calls.teams[1]).toMatchObject({ first: 1, after: "cursor-9" });
});

test("listTeams normalizes SDK failures", async () => {
  const { client } = makeClient({
    teams: async () => {
      throw new LinearError({}, [], LinearErrorType.AuthenticationError);
    },
  });
  await expect(serviceFor(client).listTeams()).rejects.toMatchObject({ code: "AUTH_EXPIRED" });
});

// ------------------------------------------------ v0.2: getTeam / states

const stubTeams = {
  resolveTeam: async () => ({ id: "tm_1", key: "ENG", name: "Engineering" }),
};

function detailServiceFor(client: unknown) {
  const factory: LinearClientFactoryLike = { create: async () => client as never, clear() {} };
  return new LinearTeamService(factory, stubTeams as never);
}

test("getTeam resolves the reference and maps details", async () => {
  const client = {
    team: async (id: string) => ({
      id,
      key: "ENG",
      name: "Engineering",
      displayName: "Engineering Team",
      issueCount: 42,
      timezone: "Asia/Shanghai",
      cyclesEnabled: true,
      triageEnabled: false,
    }),
  };
  const team = await detailServiceFor(client).getTeam("Engineering");
  expect(team).toEqual({
    id: "tm_1",
    key: "ENG",
    name: "Engineering",
    displayName: "Engineering Team",
    issueCount: 42,
    timezone: "Asia/Shanghai",
    cyclesEnabled: true,
    triageEnabled: false,
  });
});

test("getTeam omits absent optional details", async () => {
  const client = {
    team: async (id: string) => ({ id, key: "ENG", name: "Engineering" }),
  };
  const team = await detailServiceFor(client).getTeam("ENG");
  expect(team).toEqual({ id: "tm_1", key: "ENG", name: "Engineering" });
});

test("getTeam reports NOT_FOUND for a missing team model", async () => {
  const client = { team: async () => undefined };
  await expect(detailServiceFor(client).getTeam("Ghost")).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});

test("listWorkflowStates pages the team states connection", async () => {
  const calls: string[] = [];
  const client = {
    team: async () => ({
      states: async (variables: { first: number }) => {
        calls.push(`first=${variables.first}`);
        return {
          nodes: [
            { id: "st_1", name: "Backlog", type: "backlog", position: 0 },
            { id: "st_2", name: "In Progress", type: "started", position: 1 },
          ],
          pageInfo: { hasNextPage: true, endCursor: "c2" },
        };
      },
    }),
  };
  const result = await detailServiceFor(client).listWorkflowStates("Engineering", { limit: 50 });
  expect(calls).toEqual(["first=50"]);
  expect(result).toEqual({
    items: [
      { id: "st_1", name: "Backlog", type: "backlog", position: 0 },
      { id: "st_2", name: "In Progress", type: "started", position: 1 },
    ],
    hasMore: true,
    nextCursor: "c2",
  });
});

test("getWorkflowState resolves by name through the states scan", async () => {
  const client = {
    team: async () => ({
      states: async () => ({
        nodes: [
          { id: "st_1", name: "Backlog", type: "backlog" },
          { id: "st_2", name: "In Progress", type: "started" },
        ],
        pageInfo: { hasNextPage: false },
      }),
    }),
  };
  const team = await detailServiceFor(client).getWorkflowState("Engineering", "in progress");
  expect(team).toEqual({ id: "st_2", name: "In Progress", type: "started" });
  await expect(
    detailServiceFor(client).getWorkflowState("Engineering", "Ghost"),
  ).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
