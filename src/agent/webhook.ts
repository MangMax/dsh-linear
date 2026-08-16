/**
 * Webhook route (plan §39, §40; Milestone 8).
 *
 * `POST /integrations/linear/webhook` — the Linear → Harness entry point.
 * Signature verification is NOT re-implemented: `LinearWebhookClient` from
 * `@linear/sdk/webhooks` reads the raw body, verifies the HMAC signature and
 * the 60-second timestamp window, dispatches the typed payload to registered
 * handlers, and writes the response itself (plan §39).
 *
 * Security (plan §40): the harness web server must NOT be exposed raw to the
 * public internet. Production routes Linear → HTTPS reverse proxy / edge
 * gateway → this single path → Harness loopback. The signing secret lives in
 * the credential store (ref {@link WEBHOOK_SECRET_REF} by default, overridable
 * via settings); it is re-resolved per request so a rotation takes effect
 * without a plugin restart, and it never reaches logs (§38).
 *
 * Timing contract (Linear docs): the receiver must respond within 5 seconds,
 * and on a `created` event the agent must send an activity or update its
 * external URL within 10 seconds. The route therefore hands the verified
 * event to the bridge fire-and-forget and returns immediately.
 */
import { LinearWebhookClient } from "@linear/sdk/webhooks";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { SecretStore } from "../harness/credentials.ts";
import type { LinearAgentBridge } from "./bridge.ts";

/** Canonical webhook path (plan §39); stable — it is registered in the Linear OAuth app. */
export const WEBHOOK_PATH = "/integrations/linear/webhook";

/** Credential ref holding the webhook signing secret (plan §25). */
export const WEBHOOK_SECRET_REF = "DSH_LINEAR_WEBHOOK_SECRET";

/** Linear's webhook event type for agent sessions. */
export const AGENT_SESSION_EVENT_TYPE = "AgentSessionEvent";

/** Logger subset the route needs (plan §38). */
export interface WebhookLogger {
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

export interface AgentWebhookRouteOptions {
  /** Credential store resolving the signing secret (per request). */
  secretStore: SecretStore;
  /** Credential ref of the signing secret (settings; default {@link WEBHOOK_SECRET_REF}). */
  webhookSecretRef: string;
  /** The agent bridge; undefined when agent mode is disabled or misconfigured. */
  bridge: LinearAgentBridge | undefined;
  logger: WebhookLogger;
}

/**
 * Build the webhook route handler for `webServer.register({ kind: "exact",
 * path: WEBHOOK_PATH, handler })`. The handler resolves the secret, verifies
 * the request with `LinearWebhookClient` and dispatches `AgentSessionEvent`
 * payloads to the bridge. Never throws: every failure becomes an HTTP status.
 */
export function createAgentWebhookRoute(options: AgentWebhookRouteOptions) {
  const { secretStore, webhookSecretRef, bridge, logger } = options;

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!bridge) {
      respond(res, 503, "agent mode is not active on this harness");
      return;
    }

    let secret: string | undefined;
    try {
      secret = await secretStore.get(webhookSecretRef);
    } catch (err) {
      logger.error("linear.webhook secret lookup failed: %s", messageOf(err));
      respond(res, 503, "webhook secret could not be resolved");
      return;
    }

    if (!secret) {
      // 503 signals Linear to retry — the operator may still be configuring
      // the secret; never log the ref's value (§38).
      logger.warn(
        "linear.webhook received a request but the signing secret is not configured (ref=%s); responding 503.",
        webhookSecretRef,
      );
      respond(res, 503, "webhook secret is not configured");
      return;
    }

    const client = new LinearWebhookClient(secret);
    const handler = client.createHandler();
    handler.on(AGENT_SESSION_EVENT_TYPE, (payload) => {
      // Fire-and-forget: the SDK handler awaits listeners before answering,
      // and Linear's contract is a response within 5 seconds.
      void bridge
        .handleAgentSessionEvent(payload as never)
        .catch((err) => logger.error("linear.agent bridge failed: %s", messageOf(err)));
    });
    try {
      await handler(req, res);
    } catch (err) {
      logger.error("linear.webhook handler failed: %s", messageOf(err));
      respond(res, 500, "webhook processing failed");
    }
  };
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message.split(/\r?\n/)[0] || String(err) : String(err);
}

function respond(res: ServerResponse, status: number, message: string): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify({ error: "linear_webhook", message }));
}
