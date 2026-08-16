/**
 * Label + attachment service contract tests (plan §53.2 — v0.2 batch).
 */
import { expect, test, vi } from "vite-plus/test";
import { LinearLabelService } from "../../src/linear/services/label-service.ts";
import { LinearAttachmentService } from "../../src/linear/services/attachment-service.ts";
import type { LinearClientFactoryLike } from "../../src/linear/client-factory.ts";

function factoryFor(client: unknown): LinearClientFactoryLike {
  return { create: async () => client as never, clear() {} };
}

const stubTeams = {
  resolveTeam: async () => ({ id: "tm_1", key: "ENG", name: "Engineering" }),
};

// ------------------------------------------------------------------- labels

test("listIssueLabels maps nodes and pagination", async () => {
  const calls: unknown[] = [];
  const client = {
    issueLabels: async (variables: unknown) => {
      calls.push(variables);
      return {
        nodes: [
          { id: "lb_1", name: "bug", color: "#ff0000", isGroup: false },
          { id: "lb_2", name: "priority:p0", color: null, isGroup: true },
        ],
        pageInfo: { hasNextPage: false },
      };
    },
  };
  const service = new LinearLabelService(factoryFor(client), stubTeams as never);
  const result = await service.listIssueLabels();
  expect(calls).toEqual([{ first: 20, after: undefined }]);
  expect(result.items).toEqual([
    { id: "lb_1", name: "bug", color: "#ff0000", isGroup: false },
    { id: "lb_2", name: "priority:p0", isGroup: true },
  ]);
  expect(result.hasMore).toBe(false);
});

test("listIssueLabels narrows to a resolved team", async () => {
  const calls: unknown[] = [];
  const client = {
    issueLabels: async (variables: unknown) => {
      calls.push(variables);
      return { nodes: [], pageInfo: { hasNextPage: false } };
    },
  };
  const service = new LinearLabelService(factoryFor(client), stubTeams as never);
  await service.listIssueLabels({ team: "Engineering" });
  expect(calls).toEqual([
    { filter: { team: { id: { eq: "tm_1" } } }, first: 20, after: undefined },
  ]);
});

// ------------------------------------------------------------- attachments

test("listAttachments pages the issue attachments connection", async () => {
  const calls: string[] = [];
  const client = {
    issue: async () => ({
      attachments: async (variables: { first: number }) => {
        calls.push(`first=${variables.first}`);
        return {
          nodes: [
            {
              id: "at_1",
              title: "Screenshot",
              url: "https://example.com/s.png",
              sourceType: "image",
              createdAt: new Date("2026-08-15T00:00:00Z"),
            },
          ],
          pageInfo: { hasNextPage: false },
        };
      },
    }),
  };
  const service = new LinearAttachmentService(factoryFor(client));
  const result = await service.listAttachments("NERV-123", { limit: 5 });
  expect(calls).toEqual(["first=5"]);
  expect(result.items).toEqual([
    {
      id: "at_1",
      title: "Screenshot",
      url: "https://example.com/s.png",
      sourceType: "image",
      createdAt: "2026-08-15T00:00:00.000Z",
    },
  ]);
});

test("listAttachments reports NOT_FOUND for a missing issue", async () => {
  const client = { issue: async () => undefined };
  const service = new LinearAttachmentService(factoryFor(client));
  await expect(service.listAttachments("NERV-404")).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("createAttachment sends the mutation with the resolved issue id", async () => {
  const calls: unknown[] = [];
  const client = {
    createAttachment: async (input: unknown) => {
      calls.push(input);
      return {
        attachment: {
          id: "at_9",
          title: "Design doc",
          url: "https://docs.example.com/1",
          sourceType: "url",
          createdAt: new Date("2026-08-15T01:00:00Z"),
        },
      };
    },
  };
  const service = new LinearAttachmentService(factoryFor(client));
  const attachment = await service.createAttachment(
    "https://linear.app/mangax/issue/NERV-123/foo",
    "https://docs.example.com/1",
    "Design doc",
  );
  expect(calls).toEqual([
    { issueId: "NERV-123", url: "https://docs.example.com/1", title: "Design doc" },
  ]);
  expect(attachment.title).toBe("Design doc");
});

// ------------------------------------------------ Codex parity: deletes/creates

test("deleteAttachment sends the id", async () => {
  const calls: string[] = [];
  const client = {
    deleteAttachment: async (id: string) => {
      calls.push(id);
      return { success: true };
    },
  };
  const service = new LinearAttachmentService(factoryFor(client));
  await service.deleteAttachment("at_1");
  expect(calls).toEqual(["at_1"]);
});

test("createIssueLabel sends name/color/team and maps", async () => {
  const calls: unknown[] = [];
  const client = {
    createIssueLabel: async (input: unknown) => {
      calls.push(input);
      return { issueLabel: { id: "lb_9", name: "smoke", color: "#ff0000", isGroup: false } };
    },
  };
  const service = new LinearLabelService(factoryFor(client), stubTeams as never);
  const label = await service.createIssueLabel("smoke", { color: "#ff0000", team: "Engineering" });
  expect(calls).toEqual([{ name: "smoke", color: "#ff0000", teamId: "tm_1" }]);
  expect(label).toEqual({ id: "lb_9", name: "smoke", color: "#ff0000", isGroup: false });
});

// ------------------------------------------------ §68.1 A: upload pipeline

test("prepareAttachmentUpload maps the signed upload plan", async () => {
  const calls: unknown[] = [];
  const client = {
    fileUpload: async (contentType: string, filename: string, size: number) => {
      calls.push({ contentType, filename, size });
      return {
        success: true,
        uploadFile: {
          assetUrl: "https://assets.linear.app/xyz",
          uploadUrl: "https://storage.googleapis.com/signed/xyz",
          headers: [
            { key: "Content-Type", value: "application/pdf" },
            { key: "x-goog-content-length-range", value: "0,1048576" },
          ],
          filename,
          contentType,
          size,
        },
      };
    },
  };
  const service = new LinearAttachmentService(factoryFor(client));
  const plan = await service.prepareAttachmentUpload("report.pdf", "application/pdf", 1024);
  expect(calls).toEqual([{ contentType: "application/pdf", filename: "report.pdf", size: 1024 }]);
  expect(plan).toEqual({
    assetUrl: "https://assets.linear.app/xyz",
    uploadUrl: "https://storage.googleapis.com/signed/xyz",
    headers: [
      { key: "content-type", value: "application/pdf" },
      { key: "Content-Type", value: "application/pdf" },
      { key: "x-goog-content-length-range", value: "0,1048576" },
    ],
    filename: "report.pdf",
    contentType: "application/pdf",
    size: 1024,
  });
});

test("prepareAttachmentUpload rejects invalid inputs", async () => {
  const client = { fileUpload: async () => ({ success: false }) };
  const service = new LinearAttachmentService(factoryFor(client));
  await expect(service.prepareAttachmentUpload("", "application/pdf", 10)).rejects.toMatchObject({
    code: "VALIDATION_ERROR",
  });
  await expect(
    service.prepareAttachmentUpload("a.pdf", "application/pdf", 0),
  ).rejects.toMatchObject({
    code: "VALIDATION_ERROR",
  });
  await expect(
    service.prepareAttachmentUpload("a.pdf", "application/pdf", 21 * 1024 * 1024),
  ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
});

test("createAttachmentFromUpload links the assetUrl through createAttachment", async () => {
  const calls: unknown[] = [];
  const client = {
    createAttachment: async (input: unknown) => {
      calls.push(input);
      return {
        attachment: {
          id: "at_7",
          title: "report.pdf",
          url: "https://assets.linear.app/xyz",
          createdAt: new Date("2026-08-15T00:00:00Z"),
        },
      };
    },
  };
  const service = new LinearAttachmentService(factoryFor(client));
  const attachment = await service.createAttachmentFromUpload(
    "NERV-123",
    "https://assets.linear.app/xyz",
  );
  expect(calls).toEqual([
    {
      issueId: "NERV-123",
      url: "https://assets.linear.app/xyz",
      title: "Uploaded attachment",
    },
  ]);
  expect(attachment.id).toBe("at_7");
});

// ------------------------------------------------ §68.1 B: one-shot upload

test("uploadAttachmentFile runs prepare → PUT → finalize host-side", async () => {
  const calls: string[] = [];
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const client = {
    fileUpload: async (contentType: string, filename: string, size: number) => {
      calls.push(`prepare:${filename}:${contentType}:${size}`);
      return {
        success: true,
        uploadFile: {
          assetUrl: "https://assets.linear.app/x",
          uploadUrl: "https://storage.googleapis.com/signed/x",
          headers: [{ key: "x-goog-content-length-range", value: "4,4" }],
          filename,
          contentType,
          size,
        },
      };
    },
    createAttachment: async (input: { issueId: string; url: string; title: string }) => {
      calls.push(`finalize:${input.issueId}:${input.url}:${input.title}`);
      return {
        attachment: {
          id: "at_8",
          title: input.title,
          url: input.url,
          createdAt: new Date("2026-08-15T00:00:00Z"),
        },
      };
    },
  };
  const reader = {
    read: async () => ({ bytes, filename: "note.txt", contentType: "text/plain", size: 4 }),
  };
  const fetchMock = vi.fn(
    async (
      url: string,
      init: { method: string; headers: Record<string, string>; body: unknown },
    ) => {
      calls.push(`put:${init.method}:${init.headers["x-goog-content-length-range"]}`);
      return new Response(null, { status: 200 });
    },
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as never;

  try {
    const service = new LinearAttachmentService(factoryFor(client), reader as never);
    const attachment = await service.uploadAttachmentFile("NERV-123", "/tmp/note.txt");
    expect(attachment.id).toBe("at_8");
    expect(calls).toEqual([
      "prepare:note.txt:text/plain:4",
      "put:PUT:4,4",
      "finalize:NERV-123:https://assets.linear.app/x:note.txt",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uploadAttachmentFile reports the PUT failure without leaking the signed URL", async () => {
  const client = {
    fileUpload: async () => ({
      success: true,
      uploadFile: {
        assetUrl: "https://assets.linear.app/x",
        uploadUrl: "https://storage.googleapis.com/signed/x",
        headers: [],
        filename: "f.txt",
        contentType: "text/plain",
        size: 2,
      },
    }),
  };
  const reader = {
    read: async () => ({
      bytes: new Uint8Array([1, 2]),
      filename: "f.txt",
      contentType: "text/plain",
      size: 2,
    }),
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("SignatureDoesNotMatch", { status: 403 })) as never;
  try {
    const service = new LinearAttachmentService(factoryFor(client), reader as never);
    await expect(service.uploadAttachmentFile("NERV-123", "f.txt")).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
