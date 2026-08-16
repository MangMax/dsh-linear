/**
 * Web route adapter (plan §23, §40; Milestone 5).
 *
 * Adapter over `ctx.webServer` for the OAuth callback route
 * (`/integrations/linear/oauth/callback`) plus the route handler that
 * drives {@link OAuthProvider.handleCallback} and renders a small
 * success / error page.
 *
 * ⚠ Lifecycle hard requirement (verified on the target wave, plan §23):
 * `webServer.register()` is a PLAIN method — it writes into the route table
 * and returns a disposer, but does not attach itself to the Cordis fiber.
 * The plugin must wrap registration in `ctx.effect(...)`; otherwise routes
 * leak on stop / restart / hot reload and the next start throws
 * `webserver: duplicate exact route "…"` (there is no remove-by-path API).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { WebServer } from "@deepseek-ai/dsh-host-webserver";
import type { OAuthCallbackParams, OAuthProvider } from "../auth/oauth-provider.ts";
import { LinearConnectorError } from "../linear/error.ts";

/** Canonical OAuth callback path; keep stable — it is registered in the Linear app. */
export const OAUTH_CALLBACK_PATH = "/integrations/linear/oauth/callback";

/** The subset of the webserver service the adapter needs. */
export type WebServerLike = Pick<WebServer, "register" | "port" | "host">;

export interface WebRouteRegistrar {
  registerCallback(
    path: string,
    handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>,
  ): () => void;
}

/** Adapter over the harness web server: registers exact routes with disposers. */
export class HarnessWebServer implements WebRouteRegistrar {
  constructor(private readonly server: WebServerLike) {}

  registerCallback(
    path: string,
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
  ): () => void {
    return this.server.register({ kind: "exact", path, handler });
  }

  /** The actual listening port (config 0 → OS-assigned); used for redirect-URI alignment. */
  get port(): number {
    return this.server.port;
  }
}

/**
 * The OAuth callback handler (plan §23): parses the authorization response
 * query, hands it to the provider (state validation + code exchange +
 * bundle persist) and renders a small page. Tokens are never echoed in the
 * page and the response is never cached. The page text follows the browser's
 * `Accept-Language` (zh / en; anything else falls back to English).
 */
export function createOAuthCallbackHandler(provider: OAuthProvider) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const copy = pickLanguage(req) === "zh" ? COPY_ZH : COPY_EN;
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const params: OAuthCallbackParams = {
      code: url.searchParams.get("code") ?? undefined,
      state: url.searchParams.get("state") ?? undefined,
      error: url.searchParams.get("error") ?? undefined,
      errorDescription: url.searchParams.get("error_description") ?? undefined,
    };
    try {
      await provider.handleCallback(params);
      respond(res, 200, copy.connectedTitle, copy.connectedMessage);
    } catch (err) {
      const error =
        err instanceof LinearConnectorError
          ? err
          : new LinearConnectorError(
              "LINEAR_API_ERROR",
              "The OAuth callback could not be completed.",
            );
      respond(res, 400, copy.failedTitle, error.message);
    }
  };
}

/**
 * Callback-page copy. The error detail stays in the connector's model-facing
 * language (English — the agent reads the same text in tool output); chrome
 * and the success text follow the browser locale.
 */
const COPY_EN = {
  connectedTitle: "Linear connected",
  connectedMessage:
    "The Linear workspace is connected. You can close this tab and return to Harness.",
  failedTitle: "Linear connection failed",
};

const COPY_ZH = {
  connectedTitle: "Linear 已连接",
  connectedMessage: "Linear 工作区已连接。你可以关闭此标签页并返回 Harness。",
  failedTitle: "Linear 连接失败",
};

function pickLanguage(req: IncomingMessage): "zh" | "en" {
  const header = req.headers["accept-language"] ?? "";
  return /^\s*zh/i.test(header) ? "zh" : "en";
}

function respond(res: ServerResponse, status: number, title: string, message: string): void {
  res.statusCode = status;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; padding: 0 1rem; }
  h1 { font-size: 1.25rem; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(message)}</p>
</body>
</html>`,
  );
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
