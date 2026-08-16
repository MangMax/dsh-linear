/**
 * Web route adapter (plan §23, §40; Milestone 5).
 *
 * Adapter over `ctx.webServer` for the OAuth callback route
 * (`/integrations/linear/oauth/callback`) plus the route handler that
 * drives {@link OAuthProvider.handleCallback} and renders a themed
 * success / error page.
 *
 * The callback page is a standalone document (it opens in a NEW tab while
 * the settings card stays open), so it cannot read the harness GUI's CSS
 * variables. It embeds the same DSW design tokens instead — the resolved
 * `--dsw-alias-*` values from the GUI's design-platform.css, light and
 * dark — and resolves the theme the same way the app shell does:
 * `prefers-color-scheme` (system preference) with `color-scheme` set on
 * the root. The card reuses the GUI's visual language: 12px-radius bordered
 * card on the app background, status icon (success / error), the GUI font
 * stack, primary + ghost buttons, and a muted footer.
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
 * bundle persist) and renders a themed page. Tokens are never echoed in the
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
      respond(res, 200, "success", copy, copy.connectedTitle, copy.connectedMessage);
    } catch (err) {
      const error =
        err instanceof LinearConnectorError
          ? err
          : new LinearConnectorError(
              "LINEAR_API_ERROR",
              "The OAuth callback could not be completed.",
            );
      respond(res, 400, "error", copy, copy.failedTitle, error.message);
    }
  };
}

/** Localized chrome + result copy for the callback page. */
interface CallbackCopy {
  lang: "zh" | "en";
  connectedTitle: string;
  connectedMessage: string;
  failedTitle: string;
  returnToHarness: string;
  closeTab: string;
  footer: string;
}

/**
 * Callback-page copy. The error detail stays in the connector's model-facing
 * language (English — the agent reads the same text in tool output); chrome
 * and the success text follow the browser locale.
 */
const COPY_EN: CallbackCopy = {
  lang: "en" as const,
  connectedTitle: "Linear connected",
  connectedMessage:
    "The Linear workspace is connected. You can close this tab and return to Harness.",
  failedTitle: "Linear connection failed",
  returnToHarness: "Return to Harness",
  closeTab: "Close this tab",
  footer: "DeepSeek Harness · Linear Connector",
};

const COPY_ZH: CallbackCopy = {
  lang: "zh" as const,
  connectedTitle: "Linear 已连接",
  connectedMessage: "Linear 工作区已连接。你可以关闭此标签页并返回 Harness。",
  failedTitle: "Linear 连接失败",
  returnToHarness: "返回 Harness",
  closeTab: "关闭标签页",
  footer: "DeepSeek Harness · Linear 连接器",
};

function pickLanguage(req: IncomingMessage): "zh" | "en" {
  const header = req.headers["accept-language"] ?? "";
  return /^s*zh/i.test(header) ? "zh" : "en";
}

/**
 * Renders the callback result page. The card mirrors the harness GUI's
 * design language (see the module doc): DSW alias tokens embedded for the
 * standalone document, system-theme resolution, status icon, primary /
 * ghost actions. The "Return to Harness" action links to the harness root
 * (the callback is served by the same web server as the GUI); the success
 * page additionally offers "Close this tab" — the tab was opened by the
 * settings card, so `window.close()` is allowed there.
 */
function respond(
  res: ServerResponse,
  status: number,
  variant: "success" | "error",
  copy: CallbackCopy,
  title: string,
  message: string,
): void {
  res.statusCode = status;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(renderPage(variant, copy, title, message));
}

function renderPage(
  variant: "success" | "error",
  copy: CallbackCopy,
  title: string,
  message: string,
): string {
  const icon =
    variant === "success"
      ? `<span class="dshl-icon dshl-iconSuccess" aria-hidden="true">
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4 10-10"/></svg>
</span>`
      : `<span class="dshl-icon dshl-iconError" aria-hidden="true">
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
</span>`;
  const closeButton =
    variant === "success"
      ? `
    <button type="button" id="dshl-close" class="dshl-btn dshl-btnGhost">${escapeHtml(copy.closeTab)}</button>`
      : "";
  const actions = `
  <div class="dshl-actions">
    <a class="dshl-btn dshl-btnPrimary" href="/">${escapeHtml(copy.returnToHarness)}</a>${closeButton}
  </div>`;
  // Only the success page carries the close-tab script; the error page has
  // no script at all (a rejected callback must not run page code).
  const closeScript =
    variant === "success"
      ? `
<script>
  (function () {
    var close = document.getElementById("dshl-close");
    if (close) {
      close.addEventListener("click", function () {
        try { window.close(); } catch (_) { /* not a script-openable tab */ }
      });
    }
  })();
</script>`
      : "";
  return `<!doctype html>
<html lang="${copy.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  /* DSW design tokens (resolved values from the harness GUI's
     design-platform.css; the callback page is a standalone document and
     cannot read the app shell's variables). Light palette is the default;
     the dark palette mirrors body[data-ds-dark-theme]. */
  :root {
    color-scheme: light;
    --dsw-alias-bg-base: rgb(249, 250, 251);
    --dsw-alias-bg-layer-3: rgb(255, 255, 255);
    --dsw-alias-border-l2: rgba(0, 0, 0, 0.1);
    --dsw-alias-label-primary: rgb(15, 17, 21);
    --dsw-alias-label-secondary: rgb(97, 102, 107);
    --dsw-alias-label-tertiary: rgb(129, 133, 140);
    --dsw-alias-label-dimmed: rgb(225, 229, 238);
    --dsw-alias-button-primary-fill: rgb(15, 17, 21);
    --dsw-alias-button-primary-hover: rgb(67, 69, 74);
    --dsw-alias-label-primary-foreground: rgb(255, 255, 255);
    --dsw-alias-state-success-primary: rgb(34, 197, 94);
    --dsw-alias-state-success-tertiary: rgb(230, 250, 237);
    --dsw-alias-state-error-primary: rgb(236, 19, 19);
    --dsw-alias-interactive-bg-hover-danger: rgba(236, 19, 19, 0.05);
    --dsw-alias-state-business-primary: rgb(65, 118, 230);
    --dsw-shadow-lv3: 0 0 1px 0 rgba(0, 0, 0, 0.2), 0 0 4px 0 rgba(0, 0, 0, 0.02), 0 12px 32px 0 rgba(0, 0, 0, 0.08);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --dsw-alias-bg-base: rgb(21, 21, 23);
      --dsw-alias-bg-layer-3: rgb(53, 54, 56);
      --dsw-alias-border-l2: rgba(255, 255, 255, 0.12);
      --dsw-alias-label-primary: rgb(249, 250, 251);
      --dsw-alias-label-secondary: rgb(207, 211, 214);
      --dsw-alias-label-tertiary: rgb(173, 178, 184);
      --dsw-alias-label-dimmed: rgb(67, 69, 74);
      --dsw-alias-button-primary-fill: rgb(249, 250, 251);
      --dsw-alias-button-primary-hover: rgb(235, 238, 242);
      --dsw-alias-label-primary-foreground: rgb(15, 17, 21);
      --dsw-alias-state-success-primary: rgb(34, 197, 94);
      --dsw-alias-state-success-tertiary: rgb(35, 60, 44);
      --dsw-alias-state-error-primary: rgb(242, 90, 90);
      --dsw-alias-interactive-bg-hover-danger: rgba(242, 90, 90, 0.15);
      --dsw-alias-state-business-primary: rgb(103, 158, 254);
      --dsw-shadow-lv3: 0 0 1px 0 rgba(0, 0, 0, 0.5), 0 0 4px 0 rgba(0, 0, 0, 0.2), 0 12px 32px 0 rgba(0, 0, 0, 0.4);
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif;
    background: var(--dsw-alias-bg-base);
    color: var(--dsw-alias-label-primary);
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    -webkit-font-smoothing: antialiased;
  }
  .dshl-card {
    width: 100%;
    max-width: 400px;
    background: var(--dsw-alias-bg-layer-3);
    border: 1px solid var(--dsw-alias-border-l2);
    border-radius: 12px;
    box-shadow: var(--dsw-shadow-lv3);
    padding: 36px 28px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    text-align: center;
    animation: dshl-rise 0.18s ease-out;
  }
  @keyframes dshl-rise {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .dshl-card { animation: none; }
  }
  .dshl-icon {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 10px;
  }
  .dshl-iconSuccess { background: var(--dsw-alias-state-success-tertiary); color: var(--dsw-alias-state-success-primary); }
  .dshl-iconError { background: var(--dsw-alias-interactive-bg-hover-danger); color: var(--dsw-alias-state-error-primary); }
  .dshl-title { margin: 0; font-size: 17px; font-weight: 600; line-height: 1.4; }
  .dshl-message { margin: 0; font-size: 13px; line-height: 1.6; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
  .dshl-actions { display: flex; gap: 8px; margin-top: 18px; width: 100%; }
  .dshl-btn {
    appearance: none;
    font: inherit;
    font-size: 13px;
    line-height: 1.5;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    padding: 7px 14px;
    border-radius: 8px;
    border: 1px solid transparent;
    cursor: pointer;
    text-decoration: none;
    color: inherit;
    transition: background 0.16s, border-color 0.16s, color 0.16s;
  }
  .dshl-btnPrimary { background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); }
  .dshl-btnPrimary:hover { background: var(--dsw-alias-button-primary-hover); }
  .dshl-btnGhost { background: transparent; border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); }
  .dshl-btnGhost:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-dimmed); }
  .dshl-btn:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
  .dshl-footer { margin-top: 18px; font-size: 11px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }
</style>
</head>
<body>
<main class="dshl-card" role="${variant === "error" ? "alert" : "status"}">
${icon}
<h1 class="dshl-title">${escapeHtml(title)}</h1>
<p class="dshl-message">${escapeHtml(message)}</p>${actions}
<p class="dshl-footer">${escapeHtml(copy.footer)}</p>
</main>${closeScript}
</body>
</html>`;
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
