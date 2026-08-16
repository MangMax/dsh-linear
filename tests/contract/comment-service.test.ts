/**
 * Comment write-path contract tests (plan §10.7, §30, §53.2).
 *
 * Mock boundary: the Linear client. The `createComment` mutation payload is
 * recorded to assert the issue reference normalization (§31) and the body
 * pass-through.
 */
import { expect, test } from "vite-plus/test";
import { LinearError, LinearErrorType } from "@linear/sdk";
import { LinearCommentService } from "../../src/linear/services/comment-service.ts";
import type { LinearClientFactoryLike } from "../../src/linear/client-factory.ts";

const COMMENT_DATE = new Date("2026-08-15T12:00:00Z");

function makeClient(overrides: Record<string, unknown> = {}) {
  const calls: { createComment: unknown[] } = { createComment: [] };
  const resolved = (value: unknown, args: unknown[]) => {
    if (value === undefined) return undefined;
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown)(...args) : value;
  };
  const client = {
    createComment: async (input: unknown) => {
      calls.createComment.push(input);
      if ("createComment" in overrides) return resolved(overrides.createComment, [input]);
      return {
        comment: {
          id: "cm_1",
          body: "Looking into this.",
          createdAt: COMMENT_DATE,
          user: Promise.resolve({ id: "us_1", name: "Mang", email: "mang@example.com" }),
        },
      };
    },
  };
  return { client, calls };
}

function factoryFor(client: unknown): LinearClientFactoryLike {
  return { create: async () => client as never, clear() {} };
}

function serviceFor(client: unknown) {
  return new LinearCommentService(factoryFor(client));
}

test("addComment resolves the issue reference and maps the comment", async () => {
  const { client, calls } = makeClient();
  const comment = await serviceFor(client).addComment({
    issue: "https://linear.app/acme/issue/ENG-123/some-slug",
    body: "  Looking into this.  ",
  });

  expect(calls.createComment).toEqual([{ issueId: "ENG-123", body: "Looking into this." }]);
  expect(comment).toEqual({
    id: "cm_1",
    body: "Looking into this.",
    author: { id: "us_1", name: "Mang" },
    createdAt: "2026-08-15T12:00:00.000Z",
  });
});

test("addComment passes a UUID reference through unchanged", async () => {
  const { client, calls } = makeClient();
  await serviceFor(client).addComment({ issue: "d5e4f3a2b1c0d9e8", body: "hi" });
  expect(calls.createComment).toEqual([{ issueId: "d5e4f3a2b1c0d9e8", body: "hi" }]);
});

test("addComment rejects an empty body before the mutation", async () => {
  const { client, calls } = makeClient();
  const error = await serviceFor(client)
    .addComment({ issue: "ENG-123", body: "   " })
    .catch((err: unknown) => err);
  expect(error).toMatchObject({ code: "VALIDATION_ERROR" });
  expect(calls.createComment).toEqual([]);
});

test("addComment rejects invalid issue references before the mutation", async () => {
  const { client, calls } = makeClient();
  const error = await serviceFor(client)
    .addComment({ issue: "not a ref", body: "hi" })
    .catch((err: unknown) => err);
  expect(error).toMatchObject({ code: "VALIDATION_ERROR" });
  expect(calls.createComment).toEqual([]);
});

test("addComment maps a comment without an author", async () => {
  const { client } = makeClient({
    createComment: {
      comment: {
        id: "cm_2",
        body: "Anonymous",
        createdAt: COMMENT_DATE,
        user: Promise.resolve(null),
      },
    },
  });
  const comment = await serviceFor(client).addComment({ issue: "ENG-123", body: "Anonymous" });
  expect(comment).toMatchObject({ id: "cm_2", author: undefined });
});

test("addComment fails when the payload lacks the comment", async () => {
  const { client } = makeClient({ createComment: { comment: undefined } });
  const error = await serviceFor(client)
    .addComment({ issue: "ENG-123", body: "x" })
    .catch((err: unknown) => err);
  expect(error).toMatchObject({ code: "VALIDATION_ERROR" });
});

test("addComment normalizes SDK failures", async () => {
  const { client } = makeClient({
    createComment: async () => {
      throw new LinearError({}, [], LinearErrorType.Forbidden);
    },
  });
  await expect(
    serviceFor(client).addComment({ issue: "ENG-123", body: "x" }),
  ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
});

// ---------------------------------------------- v0.2: listComments

test("listComments maps comments with catalog-resolved authors", async () => {
  const client = {
    issue: async () => ({
      comments: async () => ({
        nodes: [
          { id: "cm_1", body: "hello", createdAt: new Date("2026-08-15T00:00:00Z"), userId: "u_1" },
          { id: "cm_2", body: "world", createdAt: new Date("2026-08-15T01:00:00Z"), userId: "u_2" },
        ],
        pageInfo: { hasNextPage: false },
      }),
    }),
  };
  const users = {
    getUsers: async () => [
      { id: "u_1", name: "Mang Max" },
      { id: "u_2", name: "Ada" },
    ],
  };
  const factory: LinearClientFactoryLike = { create: async () => client as never, clear() {} };
  const service = new LinearCommentService(factory, users as never);
  const result = await service.listComments("NERV-123");
  expect(result.items).toEqual([
    {
      id: "cm_1",
      body: "hello",
      author: { id: "u_1", name: "Mang Max" },
      createdAt: "2026-08-15T00:00:00.000Z",
    },
    {
      id: "cm_2",
      body: "world",
      author: { id: "u_2", name: "Ada" },
      createdAt: "2026-08-15T01:00:00.000Z",
    },
  ]);
});

test("listComments reports NOT_FOUND for a missing issue", async () => {
  const client = { issue: async () => undefined };
  const factory: LinearClientFactoryLike = { create: async () => client as never, clear() {} };
  const service = new LinearCommentService(factory);
  await expect(service.listComments("NERV-404")).rejects.toMatchObject({ code: "NOT_FOUND" });
});

// ------------------------------------------------ Codex parity: update/delete

test("updateComment awaits the lazy payload and maps", async () => {
  const calls: unknown[] = [];
  const client = {
    updateComment: async (id: string, input: unknown) => {
      calls.push([id, input]);
      return {
        comment: {
          id: "cm_9",
          body: "edited",
          createdAt: new Date("2026-08-15T00:00:00Z"),
          user: { id: "u_1", name: "Mang Max" },
        },
      };
    },
  };
  const factory: LinearClientFactoryLike = { create: async () => client as never, clear() {} };
  const service = new LinearCommentService(factory);
  const comment = await service.updateComment("cm_9", "  edited  ");
  expect(calls).toEqual([["cm_9", { body: "edited" }]]);
  expect(comment.body).toBe("edited");
  expect(comment.author?.name).toBe("Mang Max");
});

test("deleteComment sends the id", async () => {
  const calls: string[] = [];
  const client = {
    deleteComment: async (id: string) => {
      calls.push(id);
      return { success: true };
    },
  };
  const factory: LinearClientFactoryLike = { create: async () => client as never, clear() {} };
  await new LinearCommentService(factory).deleteComment("cm_9");
  expect(calls).toEqual(["cm_9"]);
});
