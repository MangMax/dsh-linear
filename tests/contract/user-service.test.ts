/**
 * User service contract tests (plan §53.2 — v0.2 tool batch).
 *
 * Mock boundary: the Linear client (fake structural SDK models) and the
 * shared UserResolver.
 */
import { expect, test } from "vite-plus/test";
import { LinearUserService } from "../../src/linear/services/user-service.ts";
import type { LinearClientFactoryLike } from "../../src/linear/client-factory.ts";

const stubUsers = {
  resolveUser: async (ref: string) => {
    if (ref === "Mang Max" || ref === "x1061875478@gmail.com") {
      return { id: "u_1", name: "Mang Max", email: "x1061875478@gmail.com" };
    }
    throw new Error("NOT_FOUND");
  },
};

function serviceFor(client: unknown) {
  const factory: LinearClientFactoryLike = { create: async () => client as never, clear() {} };
  return new LinearUserService(factory, stubUsers as never);
}

test("listUsers maps nodes, emails and pagination", async () => {
  const calls: unknown[] = [];
  const client = {
    users: async (variables: unknown) => {
      calls.push(variables);
      return {
        nodes: [
          { id: "u_1", name: "Mang Max", email: "x1061875478@gmail.com" },
          { id: "u_2", name: "Ada", email: null },
        ],
        pageInfo: { hasNextPage: true, endCursor: "c2" },
      };
    },
  };
  const result = await serviceFor(client).listUsers({ limit: 10 });
  expect(calls).toEqual([{ first: 10, after: undefined }]);
  expect(result).toEqual({
    items: [
      { id: "u_1", name: "Mang Max", email: "x1061875478@gmail.com" },
      { id: "u_2", name: "Ada" },
    ],
    hasMore: true,
    nextCursor: "c2",
  });
});

test("getUser resolves by name and returns the canonical summary", async () => {
  const client = {
    user: async (id: string) => ({
      id,
      name: "Mang Max",
      email: "x1061875478@gmail.com",
    }),
  };
  const user = await serviceFor(client).getUser("Mang Max");
  expect(user).toEqual({ id: "u_1", name: "Mang Max", email: "x1061875478@gmail.com" });
});

test("getUser resolves by email too", async () => {
  const client = { user: async (id: string) => ({ id, name: "Mang Max" }) };
  const user = await serviceFor(client).getUser("x1061875478@gmail.com");
  expect(user.name).toBe("Mang Max");
});

test("getUser surfaces resolver failures unchanged", async () => {
  const client = { user: async () => ({ id: "x", name: "x" }) };
  await expect(serviceFor(client).getUser("Ghost")).rejects.toThrow();
});
