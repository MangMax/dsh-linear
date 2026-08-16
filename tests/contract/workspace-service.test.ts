/**
 * Workspace service contract tests (plan §10.1, §53.2).
 *
 * Mock boundary: the Linear client. Fake models are plain structural objects
 * shaped like the SDK models the mapper consumes.
 */
import { expect, test } from "vite-plus/test";
import { LinearWorkspaceService } from "../../src/linear/services/workspace-service.ts";
import type { LinearClientFactoryLike } from "../../src/linear/client-factory.ts";
import { LinearError, LinearErrorType } from "@linear/sdk";

function fakeClient(overrides: Record<string, unknown> = {}) {
  return {
    organization: Promise.resolve({ id: "org_1", name: "Acme" }),
    viewer: Promise.resolve({ id: "user_1", name: "Mang", email: "mang@example.com" }),
    ...overrides,
  };
}

function factoryWith(client: unknown): LinearClientFactoryLike {
  return { create: async () => client as never, clear() {} };
}

test("getWorkspace maps organization id and name", async () => {
  const service = new LinearWorkspaceService(factoryWith(fakeClient()), "apiKey");
  await expect(service.getWorkspace()).resolves.toEqual({ id: "org_1", name: "Acme" });
});

test("getViewer maps the current user", async () => {
  const service = new LinearWorkspaceService(factoryWith(fakeClient()), "apiKey");
  await expect(service.getViewer()).resolves.toEqual({
    id: "user_1",
    name: "Mang",
    email: "mang@example.com",
  });
});

test("getConnectionStatus reports connected facts without tokens", async () => {
  const service = new LinearWorkspaceService(factoryWith(fakeClient()), "apiKey");
  await expect(service.getConnectionStatus()).resolves.toEqual({
    connected: true,
    authMode: "apiKey",
    workspace: { id: "org_1", name: "Acme" },
    viewer: { id: "user_1", name: "Mang", email: "mang@example.com" },
  });
});

test("getConnectionStatus never throws on SDK failures", async () => {
  const client = fakeClient({
    organization: Promise.reject(new LinearError({}, [], LinearErrorType.NetworkError)),
  });
  const service = new LinearWorkspaceService(factoryWith(client), "apiKey");
  await expect(service.getConnectionStatus()).resolves.toEqual({
    connected: false,
    authMode: "apiKey",
  });
});

test("getWorkspace normalizes SDK errors", async () => {
  const client = fakeClient({
    organization: Promise.reject(new LinearError({}, [], LinearErrorType.Forbidden)),
  });
  const service = new LinearWorkspaceService(factoryWith(client), "apiKey");
  await expect(service.getWorkspace()).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
});

test("connection status carries the configured auth mode", async () => {
  const service = new LinearWorkspaceService(factoryWith(fakeClient()), "oauth");
  const status = await service.getConnectionStatus();
  expect(status).toMatchObject({ connected: true, authMode: "oauth" });
});
