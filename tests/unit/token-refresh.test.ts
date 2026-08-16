import { expect, test, vi } from "vite-plus/test";
import { RefreshCoordinator } from "../../src/auth/token-refresh.ts";
import type { LinearOAuthTokenBundle } from "../../src/auth/token-store.ts";
import type { TokenRefresher } from "../../src/auth/token-refresh.ts";

const bundle: LinearOAuthTokenBundle = {
  accessToken: "access-old",
  refreshToken: "refresh-old",
  expiresAt: 0,
  scope: ["read", "write"],
  tokenType: "Bearer",
  actorMode: "user",
};

test("concurrent refreshOnce calls share a single refresh (single-flight, plan §22)", async () => {
  let refreshCount = 0;
  const refresher: TokenRefresher = {
    async refresh() {
      refreshCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { ...bundle, accessToken: "access-new" };
    },
  };
  const coordinator = new RefreshCoordinator(refresher);

  const [first, second, third] = await Promise.all([
    coordinator.refreshOnce(bundle),
    coordinator.refreshOnce(bundle),
    coordinator.refreshOnce(bundle),
  ]);

  expect(refreshCount).toBe(1);
  expect(first.accessToken).toBe("access-new");
  expect(second.accessToken).toBe("access-new");
  expect(third.accessToken).toBe("access-new");
});

test("a failed refresh does not poison the next attempt", async () => {
  let calls = 0;
  const refresher: TokenRefresher = {
    async refresh() {
      calls += 1;
      if (calls === 1) throw new Error("network");
      return { ...bundle, accessToken: "access-new" };
    },
  };
  const coordinator = new RefreshCoordinator(refresher);

  await expect(coordinator.refreshOnce(bundle)).rejects.toThrow("network");
  await expect(coordinator.refreshOnce(bundle)).resolves.toMatchObject({
    accessToken: "access-new",
  });
  expect(calls).toBe(2);
});

test("sequential refreshOnce calls each perform their own refresh", async () => {
  const refresh = vi.fn(async (b: LinearOAuthTokenBundle) => ({ ...b, accessToken: "new" }));
  const coordinator = new RefreshCoordinator({ refresh });

  await coordinator.refreshOnce(bundle);
  await coordinator.refreshOnce(bundle);

  expect(refresh).toHaveBeenCalledTimes(2);
});
