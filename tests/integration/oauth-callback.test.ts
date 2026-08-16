/**
 * OAuth callback integration tests (plan §55).
 *
 * The callback handler (route → provider) and the {@link HarnessWebServer}
 * adapter (route registration inside the plugin effect): query parsing,
 * themed success / error pages (tokens never echoed, harness GUI design
 * tokens embedded, localized CTAs), and the exact-route registration
 * contract with disposer semantics.
 */
import { expect, test, vi } from "vite-plus/test";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { OAuthProvider } from "../../src/auth/oauth-provider.ts";
import type { LinearOAuthTokenBundle } from "../../src/auth/token-store.ts";
import { LinearConnectorError } from "../../src/linear/error.ts";
import {
  HarnessWebServer,
  OAUTH_CALLBACK_PATH,
  createOAuthCallbackHandler,
} from "../../src/harness/web.ts";

const bundle: LinearOAuthTokenBundle = {
  accessToken: "access-1",
  refreshToken: "refresh-1",
  expiresAt: Date.now() + 3600_000,
  scope: ["read", "write"],
  tokenType: "bearer",
  actorMode: "user",
};

function fakeReq(url: string, headers: Record<string, string> = {}): IncomingMessage {
  return { url, headers } as unknown as IncomingMessage;
}

function fakeRes(): ServerResponse & { body(): string; headers: Record<string, string> } {
  const chunks: string[] = [];
  const headers: Record<string, string> = {};
  return {
    statusCode: 0,
    headers,
    setHeader(key: string, value: string) {
      headers[key] = value;
    },
    end(payload?: unknown) {
      if (typeof payload === "string") chunks.push(payload);
    },
    body() {
      return chunks.join("");
    },
  } as unknown as ServerResponse & { body(): string; headers: Record<string, string> };
}

function fakeProvider() {
  const handleCallback = vi.fn();
  const provider: OAuthProvider = {
    beginAuthorization: vi.fn(),
    handleCallback,
    revoke: vi.fn(),
  };
  return { provider, handleCallback };
}

test("handler parses the query and forwards it to the provider", async () => {
  const { provider, handleCallback } = fakeProvider();
  handleCallback.mockResolvedValue(bundle);
  const res = fakeRes();

  await createOAuthCallbackHandler(provider)(
    fakeReq("/integrations/linear/oauth/callback?code=the-code&state=s1"),
    res,
  );

  expect(handleCallback).toHaveBeenCalledWith({
    code: "the-code",
    state: "s1",
    error: undefined,
    errorDescription: undefined,
  });
  expect(res.statusCode).toBe(200);
  expect(res.headers["cache-control"]).toBe("no-store");
});

test("success page renders the harness-themed card with CTAs", async () => {
  const { provider, handleCallback } = fakeProvider();
  handleCallback.mockResolvedValue(bundle);
  const res = fakeRes();

  await createOAuthCallbackHandler(provider)(
    fakeReq("/integrations/linear/oauth/callback?code=the-code&state=s1"),
    res,
  );

  const body = res.body();
  // The card mirrors the GUI design language: embedded DSW tokens (light +
  // dark palettes), status role, success icon, primary + ghost actions.
  expect(body).toContain('<main class="dshl-card" role="status">');
  expect(body).toContain("dshl-iconSuccess");
  expect(body).toContain("--dsw-alias-state-success-primary");
  expect(body).toContain("@media (prefers-color-scheme: dark)");
  expect(body).toContain('class="dshl-btn dshl-btnPrimary" href="/"');
  expect(body).toContain("Return to Harness");
  expect(body).toContain('id="dshl-close"');
  expect(body).toContain("Close this tab");
  expect(body).toContain("DeepSeek Harness");
});

test("success page never echoes tokens", async () => {
  const { provider, handleCallback } = fakeProvider();
  handleCallback.mockResolvedValue(bundle);
  const res = fakeRes();

  await createOAuthCallbackHandler(provider)(
    fakeReq("/integrations/linear/oauth/callback?code=" + bundle.accessToken + "&state=s1"),
    res,
  );

  const body = res.body();
  expect(body).toContain("Linear connected");
  expect(body).not.toContain(bundle.accessToken);
  expect(body).not.toContain(bundle.refreshToken);
});

test("success page follows the browser language (zh)", async () => {
  const { provider, handleCallback } = fakeProvider();
  handleCallback.mockResolvedValue(bundle);
  const res = fakeRes();

  await createOAuthCallbackHandler(provider)(
    fakeReq("/integrations/linear/oauth/callback?code=the-code&state=s1", {
      "accept-language": "zh-CN,zh;q=0.9",
    }),
    res,
  );

  expect(res.statusCode).toBe(200);
  const body = res.body();
  expect(body).toContain("Linear 已连接");
  expect(body).toContain("关闭此标签页");
  // The page chrome follows the browser locale: lang attribute, CTA labels.
  expect(body).toContain('<html lang="zh">');
  expect(body).toContain("返回 Harness");
  expect(body).toContain("关闭标签页");
});

test("handler renders an error page for a rejected callback (state mismatch)", async () => {
  const { provider, handleCallback } = fakeProvider();
  handleCallback.mockRejectedValueOnce(
    LinearConnectorError.validation("OAuth state is unknown, already used, or expired."),
  );
  const res = fakeRes();

  await createOAuthCallbackHandler(provider)(
    fakeReq("/integrations/linear/oauth/callback?state=forged"),
    res,
  );

  expect(res.statusCode).toBe(400);
  const body = res.body();
  expect(body).toContain("Linear connection failed");
  expect(body).toContain("OAuth state is unknown");
  // The error page uses the alert role and an error icon; only the return
  // action is offered (no close button on failure).
  expect(body).toContain('<main class="dshl-card" role="alert">');
  expect(body).toContain("dshl-iconError");
  expect(body).toContain("dshl-btnPrimary");
  expect(body).not.toContain("dshl-close");
});

test("handler escapes provider error messages in the page", async () => {
  const { provider, handleCallback } = fakeProvider();
  handleCallback.mockRejectedValueOnce(
    LinearConnectorError.validation("bad <script>alert(1)</script> input"),
  );
  const res = fakeRes();

  await createOAuthCallbackHandler(provider)(
    fakeReq("/integrations/linear/oauth/callback?state=s1"),
    res,
  );

  // The error message is HTML-escaped and the error page runs no page code
  // (no inline script — the close-tab script only ships on the success page).
  expect(res.body()).toContain("bad &lt;script&gt;alert(1)&lt;/script&gt; input");
  expect(res.body()).not.toContain("bad <script>alert(1)</script> input");
  expect(res.body()).not.toContain("<script>");
});

test("HarnessWebServer registers the callback as an exact route with a disposer", () => {
  const registered: Array<{ kind: string; path: string }> = [];
  let disposed = false;
  const fakeWebServer = {
    host: "127.0.0.1",
    port: 8765,
    register(route: { kind: string; path: string }) {
      registered.push({ kind: route.kind, path: route.path });
      return () => {
        disposed = true;
      };
    },
  };

  const adapter = new HarnessWebServer(fakeWebServer as never);
  expect(adapter.port).toBe(8765);

  const dispose = adapter.registerCallback(OAUTH_CALLBACK_PATH, () => {});
  expect(registered).toEqual([{ kind: "exact", path: "/integrations/linear/oauth/callback" }]);

  dispose();
  expect(disposed).toBe(true);
});
