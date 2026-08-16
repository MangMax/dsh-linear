/**
 * Cycle service contract tests (plan §10.11, §53.2).
 *
 * Mock boundary: the Linear client and the team resolver. Verifies that the
 * team name resolves to an ID and the cycles query filters by team id.
 */
import { expect, test } from "vite-plus/test";
import { LinearError, LinearErrorType } from "@linear/sdk";
import { LinearCycleService } from "../../src/linear/services/cycle-service.ts";
import type { LinearClientFactoryLike } from "../../src/linear/client-factory.ts";
import type { TeamResolver } from "../../src/linear/resolver/team.ts";
import { LinearConnectorError } from "../../src/linear/error.ts";

const DATE = new Date("2026-08-15T10:20:00Z");

function makeClient(overrides: Record<string, unknown> = {}) {
  const calls: { cycles: unknown[] } = { cycles: [] };
  const client = {
    cycles: async (variables: unknown) => {
      calls.cycles.push(variables);
      if ("cycles" in overrides)
        return (overrides.cycles as (...a: unknown[]) => unknown)(variables);
      return {
        nodes: [
          {
            id: "cy_1",
            name: "Cycle 5",
            startsAt: DATE,
            endsAt: new Date("2026-09-15T10:20:00Z"),
            completedAt: null,
          },
        ],
        pageInfo: { hasNextPage: true, endCursor: "cursor-2" },
      };
    },
  };
  return { client, calls };
}

function serviceFor(client: unknown, teamOverride?: () => Promise<unknown>) {
  const factory: LinearClientFactoryLike = { create: async () => client as never, clear() {} };
  const teams = {
    resolveTeam: teamOverride ?? (async () => ({ id: "tm_1", key: "ENG", name: "Engineering" })),
  } as unknown as TeamResolver;
  const service = new LinearCycleService(factory, teams);
  return { service, teams };
}

test("listCycles resolves the team and filters cycles by team id", async () => {
  const { client, calls } = makeClient();
  const { service } = serviceFor(client);
  const result = await service.listCycles({ team: "ENG" });

  expect(calls.cycles).toEqual([
    {
      filter: { team: { id: { eq: "tm_1" } } },
      first: 20,
      after: undefined,
    },
  ]);
  expect(result).toEqual({
    items: [
      {
        id: "cy_1",
        name: "Cycle 5",
        startsAt: "2026-08-15T10:20:00.000Z",
        endsAt: "2026-09-15T10:20:00.000Z",
        completedAt: undefined,
      },
    ],
    hasMore: true,
    nextCursor: "cursor-2",
  });
});

test("listCycles clamps limit and forwards the cursor", async () => {
  const { client, calls } = makeClient();
  const { service } = serviceFor(client);
  await service.listCycles({ team: "ENG", limit: 500 });
  await service.listCycles({ team: "ENG", limit: 0, cursor: "cursor-9" });
  expect(calls.cycles[0]).toMatchObject({ first: 50 });
  expect(calls.cycles[1]).toMatchObject({ first: 1, after: "cursor-9" });
});

test("listCycles surfaces ambiguous team names", async () => {
  const { client, calls } = makeClient();
  const { service } = serviceFor(client, async () => {
    throw LinearConnectorError.ambiguous("team", "Backend", ["Backend", "backend"]);
  });
  await expect(service.listCycles({ team: "Backend" })).rejects.toMatchObject({
    code: "AMBIGUOUS_REFERENCE",
  });
  expect(calls.cycles).toEqual([]);
});

test("listCycles normalizes SDK failures", async () => {
  const { client } = makeClient({
    cycles: async () => {
      throw new LinearError({}, [], LinearErrorType.Ratelimited);
    },
  });
  const { service } = serviceFor(client);
  await expect(service.listCycles({ team: "ENG" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
});
