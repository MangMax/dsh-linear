/**
 * Issue write-path contract tests (plan §10.5–§10.6, §30, §53.2).
 *
 * Mock boundary: the Linear client and the metadata resolver — the same
 * shape as the read-path contract tests. The resolver stub records the
 * name → ID resolution calls, so the §14.1 contract ("resolve BEFORE the
 * mutation, fail loudly on unknown/ambiguous names") is asserted end to end,
 * and the mutation calls are recorded to prove the payload carries ONLY the
 * explicitly requested fields (plan §10.6).
 */
import { expect, test } from "vite-plus/test";
import { LinearError, LinearErrorType } from "@linear/sdk";
import {
  LinearIssueService,
  validateDueDate,
  type IssueMetadata,
  type IssueServiceOptions,
} from "../../src/linear/services/issue-service.ts";
import type { LinearClientFactoryLike } from "../../src/linear/client-factory.ts";
import { LinearConnectorError } from "../../src/linear/error.ts";

const ISSUE_DATE = new Date("2026-08-15T10:20:00Z");

function detailModel(overrides: Record<string, unknown> = {}) {
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

function makeClient(overrides: Record<string, unknown> = {}) {
  const calls: {
    issue: string[];
    createIssue: unknown[];
    updateIssue: unknown[];
  } = { issue: [], createIssue: [], updateIssue: [] };
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
    createIssue: async (input: unknown) => {
      calls.createIssue.push(input);
      if ("createIssue" in overrides) return resolved(overrides.createIssue, [input]);
      return { issue: detailModel() };
    },
    updateIssue: async (id: string, input: unknown) => {
      calls.updateIssue.push({ id, input });
      if ("updateIssue" in overrides) return resolved(overrides.updateIssue, [id, input]);
      return { issue: detailModel() };
    },
    ...catalogNodes(),
  };
  return { client, calls };
}

function catalogNodes() {
  return {
    teams: async () => ({
      nodes: [{ id: "tm_1", key: "ENG", name: "Engineering" }],
      pageInfo: { hasNextPage: false },
    }),
    users: async () => ({
      nodes: [{ id: "us_1", name: "Mang", email: "mang@example.com" }],
      pageInfo: { hasNextPage: false },
    }),
    projects: async () => ({
      nodes: [{ id: "pr_1", name: "Backend" }],
      pageInfo: { hasNextPage: false },
    }),
    issueLabels: async () => ({
      nodes: [
        { id: "lb_bug", name: "bug" },
        { id: "lb_auth", name: "auth" },
      ],
      pageInfo: { hasNextPage: false },
    }),
  };
}

function factoryFor(client: unknown): LinearClientFactoryLike {
  return { create: async () => client as never, clear() {} };
}

/**
 * Metadata resolver stub for the write path: resolves every name to the
 * fixture ids and records the calls; unknown names throw NOT_FOUND.
 */
function metadataFor(client: unknown, unknownNames: Set<string> = new Set()) {
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
  const failIfUnknown = (kind: string, ref: string) => {
    if (unknownNames.has(ref)) {
      throw LinearConnectorError.notFound(kind, ref);
    }
  };
  const metadata: IssueMetadata = {
    resolveTeam: async (ref: string) => {
      resolveCalls(client).resolveTeam.push(ref);
      failIfUnknown("team", ref);
      return { id: "tm_1", key: "ENG", name: "Engineering" };
    },
    resolveProject: async (ref: string) => {
      resolveCalls(client).resolveProject.push(ref);
      failIfUnknown("project", ref);
      return { id: "pr_1", name: "Backend" };
    },
    resolveUser: async (ref: string) => {
      resolveCalls(client).resolveUser.push(ref);
      failIfUnknown("user", ref);
      return { id: "us_1", name: "Mang", email: "mang@example.com" };
    },
    resolveWorkflowState: async (teamId: string, ref: string) => {
      resolveCalls(client).resolveWorkflowState.push(`${teamId}:${ref}`);
      failIfUnknown("state", ref);
      return { id: "st_1", name: "In Progress", type: "started" };
    },
    resolveLabels: async (refs: string[]) => {
      resolveCalls(client).resolveLabels.push(refs);
      return refs.map((ref) => {
        failIfUnknown("label", ref);
        return { id: `lb_${ref}`, name: ref };
      });
    },
    catalog: {
      getTeams: async () => [],
      getUsers: async () => [],
      getProjects: async () => [],
      getLabels: async () => [],
      getStates: async () => [],
    },
  };
  return { calls, metadata };
}

function serviceFor(
  client: unknown,
  options: IssueServiceOptions = {},
  unknownNames?: Set<string>,
) {
  const { calls, metadata } = metadataFor(client, unknownNames);
  resolveCallsByClient.set(client as object, calls);
  return new LinearIssueService(factoryFor(client), metadata, options);
}

/** Resolver-call recorder for the fake client, per serviceFor() call. */
function resolveCalls(client: unknown) {
  return resolveCallsByClient.get(client as object)!;
}

const resolveCallsByClient = new WeakMap<object, ReturnType<typeof metadataFor>["calls"]>();

// ------------------------------------------------------------ createIssue

test("createIssue resolves names to IDs and sends only the requested fields", async () => {
  const { client, calls } = makeClient();
  const issue = await serviceFor(client).createIssue({
    title: "  Ship the connector  ",
    description: "Make it native.",
    team: "Engineering",
    project: "Backend",
    status: "In Progress",
    assignee: "Mang",
    priority: "high",
    labels: ["bug", "auth"],
    dueDate: "2026-09-01",
  });

  expect(resolveCalls(client).resolveTeam).toEqual(["Engineering"]);
  expect(resolveCalls(client).resolveProject).toEqual(["Backend"]);
  expect(resolveCalls(client).resolveWorkflowState).toEqual(["tm_1:In Progress"]);
  expect(resolveCalls(client).resolveUser).toEqual(["Mang"]);
  expect(resolveCalls(client).resolveLabels).toEqual([["bug", "auth"]]);
  expect(calls.createIssue).toEqual([
    {
      teamId: "tm_1",
      title: "Ship the connector",
      description: "Make it native.",
      projectId: "pr_1",
      stateId: "st_1",
      assigneeId: "us_1",
      priority: 2,
      labelIds: ["lb_bug", "lb_auth"],
      dueDate: "2026-09-01",
    },
  ]);
  // The created issue is re-fetched and mapped to the canonical detail DTO.
  expect(issue).toMatchObject({
    identifier: "ENG-123",
    title: "Fix login token refresh",
    priority: { value: 2, label: "High" },
    team: { id: "tm_1", key: "ENG", name: "Engineering" },
  });
});

test("createIssue maps priority none to the numeric 0", async () => {
  const { client, calls } = makeClient();
  await serviceFor(client).createIssue({
    title: "No priority issue",
    team: "Engineering",
    priority: "none",
  });
  expect(calls.createIssue).toEqual([{ teamId: "tm_1", title: "No priority issue", priority: 0 }]);
});

test("createIssue falls back to the configured defaultTeam / defaultProject", async () => {
  const { client, calls } = makeClient();
  await serviceFor(client, { defaultTeam: "Engineering", defaultProject: "Backend" }).createIssue({
    title: "Defaults applied",
  });
  expect(calls.createIssue).toEqual([
    { teamId: "tm_1", title: "Defaults applied", projectId: "pr_1" },
  ]);
});

test("createIssue without a team fails before the mutation", async () => {
  const { client, calls } = makeClient();
  const error = await serviceFor(client)
    .createIssue({ title: "No team" })
    .catch((err: unknown) => err);
  expect(error).toBeInstanceOf(LinearConnectorError);
  expect(error).toMatchObject({ code: "VALIDATION_ERROR" });
  expect(calls.createIssue).toEqual([]);
  expect(calls.issue).toEqual([]);
});

test("createIssue rejects an empty title", async () => {
  const { client, calls } = makeClient();
  const error = await serviceFor(client)
    .createIssue({ title: "   ", team: "Engineering" })
    .catch((err: unknown) => err);
  expect(error).toMatchObject({ code: "VALIDATION_ERROR" });
  expect(calls.createIssue).toEqual([]);
});

test("createIssue propagates NOT_FOUND for an unknown team", async () => {
  const { client, calls } = makeClient();
  const error = await serviceFor(client, {}, new Set(["Ghost Team"]))
    .createIssue({ title: "Ghost", team: "Ghost Team" })
    .catch((err: unknown) => err);
  expect(error).toMatchObject({ code: "NOT_FOUND" });
  expect(calls.createIssue).toEqual([]);
});

test("createIssue rejects an invalid due date before the mutation", async () => {
  const { client, calls } = makeClient();
  const error = await serviceFor(client)
    .createIssue({ title: "Bad date", team: "Engineering", dueDate: "09/01/2026" })
    .catch((err: unknown) => err);
  expect(error).toMatchObject({ code: "VALIDATION_ERROR" });
  expect(calls.createIssue).toEqual([]);
});

test("createIssue fails when the payload lacks the created issue", async () => {
  const { client, calls } = makeClient({ createIssue: { issue: undefined } });
  const error = await serviceFor(client)
    .createIssue({ title: "Empty payload", team: "Engineering" })
    .catch((err: unknown) => err);
  expect(error).toMatchObject({ code: "VALIDATION_ERROR" });
  expect(calls.createIssue).toHaveLength(1);
});

test("createIssue normalizes SDK failures", async () => {
  const { client } = makeClient({
    createIssue: async () => {
      throw new LinearError({}, [], LinearErrorType.AuthenticationError);
    },
  });
  await expect(
    serviceFor(client).createIssue({ title: "Auth fails", team: "Engineering" }),
  ).rejects.toMatchObject({ code: "AUTH_EXPIRED" });
});

// ------------------------------------------------------------ updateIssue

test("updateIssue sends only the explicit fields and resolves status in the issue's team", async () => {
  const { client, calls } = makeClient();
  const issue = await serviceFor(client).updateIssue({
    issue: "eng-123",
    title: "New title",
    status: "In Progress",
    priority: "low",
  });

  expect(calls.issue).toEqual(["ENG-123"]);
  expect(resolveCalls(client).resolveWorkflowState).toEqual(["tm_1:In Progress"]);
  expect(calls.updateIssue).toEqual([
    { id: "ENG-123", input: { title: "New title", stateId: "st_1", priority: 4 } },
  ]);
  expect(issue).toMatchObject({ identifier: "ENG-123" });
});

test("updateIssue clears project, assignee and due date with null", async () => {
  const { client, calls } = makeClient();
  await serviceFor(client).updateIssue({
    issue: "ENG-123",
    project: null,
    assignee: null,
    dueDate: null,
  });
  expect(calls.updateIssue).toEqual([
    { id: "ENG-123", input: { projectId: null, assigneeId: null, dueDate: null } },
  ]);
});

test("updateIssue replaces the label set with the resolved IDs", async () => {
  const { client, calls } = makeClient();
  await serviceFor(client).updateIssue({ issue: "ENG-123", labels: ["bug"] });
  expect(calls.updateIssue).toEqual([{ id: "ENG-123", input: { labelIds: ["lb_bug"] } }]);
});

test("updateIssue without fields fails before any SDK call", async () => {
  const { client, calls } = makeClient();
  const error = await serviceFor(client)
    .updateIssue({ issue: "ENG-123" })
    .catch((err: unknown) => err);
  expect(error).toMatchObject({ code: "VALIDATION_ERROR" });
  expect(calls.issue).toEqual([]);
  expect(calls.updateIssue).toEqual([]);
});

test("updateIssue rejects invalid references before any SDK call", async () => {
  const { client, calls } = makeClient();
  const error = await serviceFor(client)
    .updateIssue({ issue: "not a ref", title: "x" })
    .catch((err: unknown) => err);
  expect(error).toMatchObject({ code: "VALIDATION_ERROR" });
  expect(calls.issue).toEqual([]);
  expect(calls.updateIssue).toEqual([]);
});

test("updateIssue maps NOT_FOUND when the issue is absent", async () => {
  const { client } = makeClient({ issue: undefined });
  const error = await serviceFor(client)
    .updateIssue({ issue: "ENG-123", title: "x" })
    .catch((err: unknown) => err);
  expect(error).toMatchObject({ code: "NOT_FOUND" });
});

test("updateIssue propagates NOT_FOUND for an unknown status", async () => {
  const { client, calls } = makeClient();
  const error = await serviceFor(client, {}, new Set(["Done-ish"]))
    .updateIssue({ issue: "ENG-123", status: "Done-ish" })
    .catch((err: unknown) => err);
  expect(error).toMatchObject({ code: "NOT_FOUND" });
  expect(calls.updateIssue).toEqual([]);
});

test("updateIssue normalizes SDK failures on the mutation", async () => {
  const { client } = makeClient({
    updateIssue: async () => {
      throw new LinearError({}, [], LinearErrorType.InvalidInput);
    },
  });
  await expect(
    serviceFor(client).updateIssue({ issue: "ENG-123", title: "x" }),
  ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
});

test("updateIssue fails when the payload lacks the updated issue", async () => {
  const { client } = makeClient({ updateIssue: { issue: undefined } });
  const error = await serviceFor(client)
    .updateIssue({ issue: "ENG-123", title: "x" })
    .catch((err: unknown) => err);
  expect(error).toMatchObject({ code: "VALIDATION_ERROR" });
});

// -------------------------------------------------------------- due dates

test("validateDueDate accepts ISO dates and rejects anything else", () => {
  expect(validateDueDate("2026-09-01")).toBe("2026-09-01");
  expect(validateDueDate(undefined)).toBeUndefined();
  expect(validateDueDate("  ")).toBeUndefined();
  expect(() => validateDueDate("09/01/2026")).toThrow(LinearConnectorError);
  expect(() => validateDueDate("2026-13-01")).toThrow(LinearConnectorError);
});
