/**
 * Browser connection API (plan §50 — Milestone 6 UI 落点, Milestone 7 网页授权).
 *
 * Same-origin JSON routes the web GUI card calls to drive the connection
 * lifecycle and the settings form. The browser half (`src/client/index.js`)
 * renders status + Connect / Disconnect / Reconnect plus the configuration
 * form in the Settings → Plugins card; this host half serves the facts and
 * actions:
 *
 * ```text
 * GET  /integrations/linear/api/status     → ConnectionStatus (never throws)
 * POST /integrations/linear/api/connect    → { kind, url? }   (OAuth authorize URL)
 * POST /integrations/linear/api/reconnect  → { kind, url? }
 * POST /integrations/linear/api/disconnect → { ok: true }
 * GET  /integrations/linear/api/settings   → redacted linear settings view
 * POST /integrations/linear/api/settings   → { ops } write via ctx.settings
 * ```
 *
 * WHY the settings routes exist (the harness wire does not serve the
 * namespace): the browser-facing settings wire (`dsh-host-apiproxy`
 * `settings.describe`) only exposes a HARD-CODED namespace allowlist
 * (`WEB_SETTINGS_NAMESPACES`) — third-party namespaces answer
 * `settings-not-exposed` even when their owner registered them ("adding a
 * section to that page is a decision made here [in dsh-host-apiproxy] rather
 * than by the registering plugin"; moving the declaration to
 * `settings.register()` is deferred work on this wave). Host-internal
 * `ctx.settings` access is unrestricted, so the plugin serves its own
 * redacted view + write seam over its own loopback routes.
 *
 * Security (plan §58): responses never contain tokens, authorization headers
 * or the client secret (secrets are redacted via `describe({ redactSecrets:
 * true })`); writes accept only a fixed field allowlist and are validated by
 * the settings schema on the host; failures normalize to `{ error, message }`
 * single lines. The routes are registered inside the plugin's `ctx.effect`
 * (same lifecycle rule as the OAuth callback, plan §23).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { LinearConnectorError } from "../linear/error.ts";
import type { LinearConnectionServiceLike } from "../linear/services/connection-service.ts";
import type { WebRouteRegistrar } from "./web.ts";

/** Canonical prefix for the browser API; keep stable — the client card fetches it. */
export const LINEAR_API_PREFIX = "/integrations/linear/api";

/** The settings service surface the settings routes need. */
export interface SettingsServiceLike {
  readonly writable: boolean;
  describe(options?: { redactSecrets?: boolean }): Array<{
    ns: string;
    value: unknown;
    base?: unknown;
    user?: unknown;
    applies: string;
    secrets?: Array<{ path: string[]; set: boolean }>;
  }>;
  update(ns: string, patch: Record<string, unknown>, expectedRevision?: number): Promise<void>;
  mutate(
    ns: string,
    ops: Array<{ op: "set" | "unset"; path: string[]; value?: unknown }>,
    expectedRevision?: number,
  ): Promise<void>;
}

/** Settings fields the browser form may write (whitelist, §58). */
const WRITABLE_FIELDS = new Set([
  "authMode",
  "oauthClientId",
  "oauthClientSecret",
  "redirectUri",
  "writePolicy",
  "agentMode",
  "webhookSecretRef",
  "agentProvider",
  "agentModel",
  "agentPreset",
]);

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

/** Map a connection failure to a clean `{ error, message }` body (plan §35). */
function errorBody(err: unknown): { error: string; message: string } {
  if (err instanceof LinearConnectorError) {
    return { error: err.code, message: err.message };
  }
  if (err instanceof Error) {
    return { error: "INTERNAL", message: err.message.split(/\r?\n/)[0] || "Unexpected error." };
  }
  return { error: "INTERNAL", message: "Unexpected error." };
}

function requireMethod(req: IncomingMessage, res: ServerResponse, method: "GET" | "POST"): boolean {
  if (req.method === method) return true;
  json(res, 405, { error: "METHOD_NOT_ALLOWED", message: `Use ${method}.` });
  return false;
}

/** Read a JSON request body (small; settings patches are tiny). */
function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? (JSON.parse(text) as Record<string, unknown>) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

/**
 * Register the connection + settings routes on the web server. Returns
 * disposers that must be collected by the plugin's `ctx.effect`.
 *
 * `meta.oauthConfigured` rides in the status response as `ui` facts so the
 * browser card can render LOCALIZED guidance without parsing the
 * model-facing English `message` — the card maps state + authMode +
 * configuration onto its own zh/en copy; the message remains the
 * tool-output contract.
 */
export interface ConnectionApiMeta {
  oauthConfigured: boolean;
}

export function registerConnectionApi(
  registrar: WebRouteRegistrar,
  connection: LinearConnectionServiceLike,
  meta: ConnectionApiMeta,
  settings?: SettingsServiceLike,
): Array<() => void> {
  const routes: Array<[string, (req: IncomingMessage, res: ServerResponse) => Promise<void>]> = [
    [
      "/status",
      async (req, res) => {
        if (!requireMethod(req, res, "GET")) return;
        const status = await connection.getStatus();
        json(res, 200, {
          ...status,
          ui: {
            oauthConfigured: meta.oauthConfigured,
          },
        });
      },
    ],
    [
      "/connect",
      async (req, res) => {
        if (!requireMethod(req, res, "POST")) return;
        try {
          const result = await connection.connect();
          json(res, 200, result);
        } catch (err) {
          json(res, 400, errorBody(err));
        }
      },
    ],
    [
      "/reconnect",
      async (req, res) => {
        if (!requireMethod(req, res, "POST")) return;
        try {
          const result = await connection.reconnect();
          json(res, 200, result);
        } catch (err) {
          json(res, 400, errorBody(err));
        }
      },
    ],
    [
      "/disconnect",
      async (req, res) => {
        if (!requireMethod(req, res, "POST")) return;
        try {
          await connection.disconnect();
          json(res, 200, { ok: true });
        } catch (err) {
          json(res, 400, errorBody(err));
        }
      },
    ],
    [
      "/settings",
      async (req, res) => {
        if (req.method === "GET") {
          if (!settings) {
            json(res, 503, {
              error: "SETTINGS_UNAVAILABLE",
              message: "Settings are not available in this deployment.",
            });
            return;
          }
          const descriptor = settings
            .describe({ redactSecrets: true })
            .find((candidate) => candidate.ns === "linear");
          if (!descriptor) {
            json(res, 503, {
              error: "SETTINGS_UNAVAILABLE",
              message: "The linear settings namespace is not registered.",
            });
            return;
          }
          json(res, 200, {
            ns: descriptor.ns,
            value: descriptor.value,
            ...(descriptor.base === undefined ? {} : { base: descriptor.base }),
            ...(descriptor.user === undefined ? {} : { user: descriptor.user }),
            applies: descriptor.applies,
            secrets: descriptor.secrets ?? [],
            writable: settings.writable,
          });
          return;
        }
        if (!requireMethod(req, res, "POST")) return;
        if (!settings) {
          json(res, 503, {
            error: "SETTINGS_UNAVAILABLE",
            message: "Settings are not available in this deployment.",
          });
          return;
        }
        try {
          const body = await readBody(req);
          const ops = body.ops;
          if (!Array.isArray(ops) || ops.length === 0) {
            json(res, 400, {
              error: "VALIDATION_ERROR",
              message: "A non-empty ops array is required.",
            });
            return;
          }
          const parsed: Array<{ op: "set" | "unset"; path: string[]; value?: unknown }> = [];
          for (const raw of ops) {
            const op = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
            if (
              !op ||
              (op.op !== "set" && op.op !== "unset") ||
              !Array.isArray(op.path) ||
              op.path.length !== 1 ||
              typeof op.path[0] !== "string"
            ) {
              json(res, 400, {
                error: "VALIDATION_ERROR",
                message: "Each op must be { op: 'set' | 'unset', path: [field] }.",
              });
              return;
            }
            if (!WRITABLE_FIELDS.has(op.path[0])) {
              json(res, 400, {
                error: "VALIDATION_ERROR",
                message: `Field "${op.path[0]}" is not writable from the browser.`,
              });
              return;
            }
            parsed.push({
              op: op.op as "set" | "unset",
              path: op.path as string[],
              ...(op.op === "set" ? { value: op.value } : {}),
            });
          }
          await settings.mutate("linear", parsed);
          json(res, 200, { ok: true });
        } catch (err) {
          json(res, 400, errorBody(err));
        }
      },
    ],
  ];

  return routes.map(([suffix, handler]) =>
    registrar.registerCallback(`${LINEAR_API_PREFIX}${suffix}`, handler),
  );
}
