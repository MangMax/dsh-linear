/**
 * Document / status update / milestone service contract tests
 * (plan §53.2 — v0.2 continuation batch).
 */
import { expect, test } from "vite-plus/test";
import {
  LinearDocumentService,
  LinearMilestoneService,
} from "../../src/linear/services/document-service.ts";
import {
  LinearCustomerService,
  LinearInitiativeService,
} from "../../src/linear/services/enterprise-service.ts";
import { LinearStatusUpdateService } from "../../src/linear/services/status-update-service.ts";
import type { LinearClientFactoryLike } from "../../src/linear/client-factory.ts";

function factoryFor(client: unknown): LinearClientFactoryLike {
  return { create: async () => client as never, clear() {} };
}

const stubProjects = {
  resolveProject: async () => ({ id: "pr_1", name: "Nerv-IIP" }),
};

const stubUsers = {
  getUsers: async () => [{ id: "u_1", name: "Mang Max" }],
};

// -------------------------------------------------------------- documents

test("listDocuments maps nodes and pagination", async () => {
  const calls: unknown[] = [];
  const client = {
    documents: async (variables: unknown) => {
      calls.push(variables);
      return {
        nodes: [
          {
            id: "doc_1",
            title: "ADR 0022",
            url: "https://linear.app/mangax/doc/adr-0022",
            projectId: "pr_1",
            createdAt: new Date("2026-08-01T00:00:00Z"),
            updatedAt: new Date("2026-08-02T00:00:00Z"),
          },
        ],
        pageInfo: { hasNextPage: false },
      };
    },
  };
  const service = new LinearDocumentService(factoryFor(client));
  const result = await service.listDocuments({ limit: 10 });
  expect(calls).toEqual([{ first: 10, after: undefined }]);
  expect(result.items).toEqual([
    {
      id: "doc_1",
      title: "ADR 0022",
      url: "https://linear.app/mangax/doc/adr-0022",
      projectId: "pr_1",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    },
  ]);
});

test("getDocument accepts a URL and maps the row", async () => {
  const client = {
    document: async (id: string) => ({
      id,
      title: "ADR",
      url: `https://linear.app/mangax/doc/${id}`,
      createdAt: new Date("2026-08-01T00:00:00Z"),
      updatedAt: new Date("2026-08-01T00:00:00Z"),
    }),
  };
  const service = new LinearDocumentService(factoryFor(client));
  const document = await service.getDocument("https://linear.app/mangax/doc/some-uuid-1234");
  expect(document.id).toBe("some-uuid-1234");
});

test("getDocument reports NOT_FOUND", async () => {
  const service = new LinearDocumentService(factoryFor({ document: async () => undefined }));
  await expect(service.getDocument("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
});

// ---------------------------------------------------------- status updates

test("listStatusUpdates maps rows, authors and project filter", async () => {
  const calls: unknown[] = [];
  const client = {
    projectUpdates: async (variables: unknown) => {
      calls.push(variables);
      return {
        nodes: [
          {
            id: "pu_1",
            body: "Phase 0 green",
            createdAt: new Date("2026-08-09T04:29:12Z"),
            updatedAt: new Date("2026-08-09T04:29:12Z"),
            projectId: "pr_1",
            userId: "u_1",
          },
        ],
        pageInfo: { hasNextPage: false },
      };
    },
  };
  const service = new LinearStatusUpdateService(
    factoryFor(client),
    stubProjects as never,
    stubUsers as never,
  );
  const result = await service.listStatusUpdates({ project: "Nerv-IIP" });
  expect(calls).toEqual([
    { filter: { project: { id: { eq: "pr_1" } } }, first: 20, after: undefined },
  ]);
  expect(result.items).toEqual([
    {
      id: "pu_1",
      body: "Phase 0 green",
      createdAt: "2026-08-09T04:29:12.000Z",
      updatedAt: "2026-08-09T04:29:12.000Z",
      projectId: "pr_1",
      authorName: "Mang Max",
    },
  ]);
});

test("getStatusUpdate maps a single row", async () => {
  const client = {
    projectUpdate: async (id: string) => ({
      id,
      body: "hello",
      createdAt: new Date("2026-08-09T00:00:00Z"),
      updatedAt: new Date("2026-08-09T00:00:00Z"),
      userId: null,
    }),
  };
  const service = new LinearStatusUpdateService(factoryFor(client), stubProjects as never);
  const update = await service.getStatusUpdate("pu_2");
  expect(update.id).toBe("pu_2");
  expect(update.authorName).toBeUndefined();
});

test("createStatusUpdate resolves the project, awaits the lazy payload and maps", async () => {
  const calls: unknown[] = [];
  const client = {
    createProjectUpdate: async (input: unknown) => {
      calls.push(input);
      return {
        projectUpdate: {
          id: "pu_3",
          body: "posted",
          createdAt: new Date("2026-08-10T00:00:00Z"),
          updatedAt: new Date("2026-08-10T00:00:00Z"),
          projectId: "pr_1",
        },
      };
    },
  };
  const service = new LinearStatusUpdateService(
    factoryFor(client),
    stubProjects as never,
    stubUsers as never,
  );
  const update = await service.createStatusUpdate("Nerv-IIP", "  posted  ");
  expect(calls).toEqual([{ projectId: "pr_1", body: "posted" }]);
  expect(update.body).toBe("posted");
});

test("createStatusUpdate rejects an empty body before touching Linear", async () => {
  const client = { createProjectUpdate: async () => ({ projectUpdate: undefined }) };
  const service = new LinearStatusUpdateService(factoryFor(client), stubProjects as never);
  await expect(service.createStatusUpdate("Nerv-IIP", "   ")).rejects.toMatchObject({
    code: "VALIDATION_ERROR",
  });
});

// -------------------------------------------------------------- milestones

test("listMilestones maps rows and narrows by project", async () => {
  const calls: unknown[] = [];
  const client = {
    projectMilestones: async (variables: unknown) => {
      calls.push(variables);
      return {
        nodes: [
          {
            id: "ms_1",
            name: "P0 Gate",
            targetDate: "2026-09-30",
            description: "gate",
            projectId: "pr_1",
          },
        ],
        pageInfo: { hasNextPage: false },
      };
    },
  };
  const service = new LinearMilestoneService(factoryFor(client), stubProjects as never);
  const result = await service.listMilestones({ project: "Nerv-IIP" });
  expect(calls).toEqual([
    { filter: { project: { id: { eq: "pr_1" } } }, first: 20, after: undefined },
  ]);
  expect(result.items).toEqual([
    {
      id: "ms_1",
      name: "P0 Gate",
      targetDate: "2026-09-30",
      description: "gate",
      projectId: "pr_1",
    },
  ]);
});

test("getMilestone looks up by ID directly and by name through the list", async () => {
  const byId = new LinearMilestoneService(
    factoryFor({ projectMilestone: async (id: string) => ({ id, name: "By Id" }) }),
    stubProjects as never,
  );
  expect((await byId.getMilestone("123e4567-e89b-12d3-a456-426614174000")).name).toBe("By Id");

  const byName = new LinearMilestoneService(
    factoryFor({
      projectMilestones: async () => ({
        nodes: [{ id: "ms_9", name: "P0 Gate" }],
        pageInfo: { hasNextPage: false },
      }),
    }),
    stubProjects as never,
  );
  expect((await byName.getMilestone("P0 Gate")).id).toBe("ms_9");
  await expect(byName.getMilestone("Ghost")).rejects.toMatchObject({ code: "NOT_FOUND" });
});

// ------------------------------------------------ Codex parity: updates

test("updateStatusUpdate awaits the lazy payload and maps", async () => {
  const calls: unknown[] = [];
  const client = {
    updateProjectUpdate: async (id: string, input: unknown) => {
      calls.push([id, input]);
      return {
        projectUpdate: {
          id: "pu_9",
          body: "edited",
          createdAt: new Date("2026-08-10T00:00:00Z"),
          updatedAt: new Date("2026-08-10T01:00:00Z"),
          projectId: "pr_1",
        },
      };
    },
  };
  const service = new LinearStatusUpdateService(
    factoryFor(client),
    stubProjects as never,
    stubUsers as never,
  );
  const update = await service.updateStatusUpdate("pu_9", "edited");
  expect(calls).toEqual([["pu_9", { body: "edited" }]]);
  expect(update.body).toBe("edited");
});

test("deleteStatusUpdate sends the id", async () => {
  const calls: string[] = [];
  const client = {
    deleteProjectUpdate: async (id: string) => {
      calls.push(id);
      return { success: true };
    },
  };
  const service = new LinearStatusUpdateService(factoryFor(client), stubProjects as never);
  await service.deleteStatusUpdate("pu_9");
  expect(calls).toEqual(["pu_9"]);
});

test("createMilestone resolves the project and maps", async () => {
  const calls: unknown[] = [];
  const client = {
    createProjectMilestone: async (input: unknown) => {
      calls.push(input);
      return { projectMilestone: { id: "ms_9", name: "Gate", projectId: "pr_1" } };
    },
  };
  const service = new LinearMilestoneService(factoryFor(client), stubProjects as never);
  const milestone = await service.createMilestone("Nerv-IIP", "Gate", { targetDate: "2026-09-30" });
  expect(calls).toEqual([{ name: "Gate", projectId: "pr_1", targetDate: "2026-09-30" }]);
  expect(milestone.name).toBe("Gate");
});

test("updateMilestone sends the id and input", async () => {
  const calls: unknown[] = [];
  const client = {
    updateProjectMilestone: async (id: string, input: unknown) => {
      calls.push([id, input]);
      return { projectMilestone: { id: "ms_9", name: "Renamed" } };
    },
  };
  const service = new LinearMilestoneService(factoryFor(client), stubProjects as never);
  const milestone = await service.updateMilestone("ms_9", { name: "Renamed" });
  expect(calls).toEqual([["ms_9", { name: "Renamed" }]]);
  expect(milestone.name).toBe("Renamed");
});

test("deleteCustomer and deleteCustomerNeed send the id", async () => {
  const calls: string[] = [];
  const client = {
    deleteCustomer: async (id: string) => {
      calls.push("customer:" + id);
      return { success: true };
    },
    deleteCustomerNeed: async (id: string) => {
      calls.push("need:" + id);
      return { success: true };
    },
  };
  const service = new LinearCustomerService(factoryFor(client));
  await service.deleteCustomer("c_1");
  await service.deleteCustomerNeed("n_1");
  expect(calls).toEqual(["customer:c_1", "need:n_1"]);
});

test("updateCustomer sends the id and name", async () => {
  const calls: unknown[] = [];
  const client = {
    updateCustomer: async (id: string, input: unknown) => {
      calls.push([id, input]);
      return { customer: { id: "c_1", name: "Renamed" } };
    },
  };
  const service = new LinearCustomerService(factoryFor(client));
  const customer = await service.updateCustomer("c_1", "Renamed");
  expect(calls).toEqual([["c_1", { name: "Renamed" }]]);
  expect(customer.name).toBe("Renamed");
});

test("createInitiativeLabel sends name/color and maps", async () => {
  const calls: unknown[] = [];
  const client = {
    createInitiativeLabel: async (input: unknown) => {
      calls.push(input);
      return { initiativeLabel: { id: "il_1", name: "alpha", color: "#0000ff" } };
    },
  };
  const service = new LinearInitiativeService(factoryFor(client));
  const label = await service.createInitiativeLabel("alpha", { color: "#0000ff" });
  expect(calls).toEqual([{ name: "alpha", color: "#0000ff" }]);
  expect(label.color).toBe("#0000ff");
});
