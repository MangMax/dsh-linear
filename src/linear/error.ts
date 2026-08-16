/**
 * Error normalization (plan §35).
 *
 * Every failure that can reach the model must be a {@link LinearConnectorError}
 * with a stable machine code and a human-friendly message. Raw GraphQL /
 * Apollo / fetch stack traces must never appear in tool output.
 */

export type LinearConnectorErrorCode =
  | "NOT_CONNECTED"
  | "AUTH_EXPIRED"
  | "AUTH_REVOKED"
  | "PERMISSION_DENIED"
  | "NOT_FOUND"
  | "AMBIGUOUS_REFERENCE"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "AGENT_UNAVAILABLE"
  | "LINEAR_API_ERROR";

export interface LinearConnectorErrorOptions {
  cause?: unknown;
}

/**
 * Map an SDK / fetch failure to a stable {@link LinearConnectorError} (plan
 * §35). Raw GraphQL / Apollo / fetch stack traces must never reach the model:
 * everything crossing this boundary gets a machine code and a short,
 * human-friendly message.
 *
 * Passthrough: {@link LinearConnectorError} itself is returned unchanged, so
 * layered services can normalize at any depth without double-wrapping.
 */
import { GraphQLClientError, LinearError, LinearErrorType } from "@linear/sdk";

const MAX_MESSAGE_LENGTH = 300;

function sanitizeMessage(message: string): string {
  const firstLine = message.split(/\r?\n/)[0]?.trim() ?? message;
  return firstLine.length > MAX_MESSAGE_LENGTH
    ? `${firstLine.slice(0, MAX_MESSAGE_LENGTH)}…`
    : firstLine;
}

/**
 * Whether a `TypeError` is a genuine network failure rather than a
 * programmatic bug. Node fetch failures surface as `TypeError: fetch failed`
 * with a `cause` (or carry a network-ish message); "x is not a function"
 * style TypeErrors are coding bugs (surfaced by the real project-detail
 * run: the SDK renamed `project.updates` → `project.projectUpdates`).
 */
export function isNetworkTypeError(err: unknown): boolean {
  if (!(err instanceof TypeError)) return false;
  const message = String(err.message);
  return (
    (err as { cause?: unknown }).cause !== undefined ||
    /fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|network/i.test(
      message,
    )
  );
}

export function normalizeLinearError(err: unknown): LinearConnectorError {
  if (err instanceof LinearConnectorError) {
    return err;
  }

  if (err instanceof LinearError) {
    const status = err.status;
    if (status === 429) {
      return new LinearConnectorError(
        "RATE_LIMITED",
        "Linear API rate limit exceeded. Wait a moment and retry.",
        { cause: err },
      );
    }
    const type = err.type;
    if (type === LinearErrorType.AuthenticationError) {
      return new LinearConnectorError(
        "AUTH_EXPIRED",
        "The Linear connection is no longer authorized. Reconnect to continue.",
        { cause: err },
      );
    }
    if (type === LinearErrorType.Forbidden || type === LinearErrorType.FeatureNotAccessible) {
      return new LinearConnectorError(
        "PERMISSION_DENIED",
        sanitizeMessage(err.message) ||
          "The Linear connection does not have permission for this operation.",
        { cause: err },
      );
    }
    if (type === LinearErrorType.Ratelimited) {
      return new LinearConnectorError(
        "RATE_LIMITED",
        "Linear API rate limit exceeded. Wait a moment and retry.",
        { cause: err },
      );
    }
    if (type === LinearErrorType.UsageLimitExceeded) {
      return new LinearConnectorError(
        "RATE_LIMITED",
        "The Linear workspace usage limit is reached (plan quota). Free up capacity or upgrade before retrying.",
        { cause: err },
      );
    }
    if (type === LinearErrorType.NetworkError) {
      return new LinearConnectorError(
        "NETWORK_ERROR",
        "Could not reach the Linear API. Check the network connection and retry.",
        { cause: err },
      );
    }
    if (type === LinearErrorType.InvalidInput) {
      return new LinearConnectorError(
        "VALIDATION_ERROR",
        sanitizeMessage(err.message) || "The Linear API rejected the request as invalid.",
        { cause: err },
      );
    }
    return new LinearConnectorError(
      "LINEAR_API_ERROR",
      sanitizeMessage(err.message) || "The Linear API returned an unexpected error.",
      { cause: err },
    );
  }

  if (err instanceof GraphQLClientError) {
    const status = err.response?.status;
    const message = err.response?.error || err.message;
    if (status === 429) {
      return new LinearConnectorError(
        "RATE_LIMITED",
        "Linear API rate limit exceeded. Wait a moment and retry.",
        { cause: err },
      );
    }
    if (status !== undefined && status >= 500) {
      return new LinearConnectorError(
        "NETWORK_ERROR",
        "The Linear API returned a server error. Retry later.",
        { cause: err },
      );
    }
    return new LinearConnectorError("LINEAR_API_ERROR", sanitizeMessage(message), { cause: err });
  }

  if (err instanceof TypeError) {
    // fetch-level failures surface as TypeError (ENOTFOUND / ECONNREFUSED /
    // "fetch failed" / …). Programmatic TypeErrors ("x is not a function")
    // are coding bugs — surface the real message as LINEAR_API_ERROR instead
    // of a misleading NETWORK_ERROR (surfaced by the real project-detail
    // run: the SDK renamed `project.updates` → `project.projectUpdates`).
    return isNetworkTypeError(err)
      ? new LinearConnectorError(
          "NETWORK_ERROR",
          "Could not reach the Linear API. Check the network connection and retry.",
          { cause: err },
        )
      : new LinearConnectorError(
          "LINEAR_API_ERROR",
          sanitizeMessage(err.message) || "Unexpected error while calling Linear.",
          { cause: err },
        );
  }

  if (err instanceof Error) {
    return new LinearConnectorError(
      "LINEAR_API_ERROR",
      sanitizeMessage(err.message) || "Unexpected error while calling Linear.",
      { cause: err },
    );
  }

  return new LinearConnectorError("LINEAR_API_ERROR", "Unexpected error while calling Linear.", {
    cause: err,
  });
}

export class LinearConnectorError extends Error {
  readonly code: LinearConnectorErrorCode;
  readonly cause?: unknown;

  constructor(
    code: LinearConnectorErrorCode,
    message: string,
    options: LinearConnectorErrorOptions = {},
  ) {
    super(message);
    this.name = "LinearConnectorError";
    this.code = code;
    this.cause = options.cause;
  }

  static notConnected(): LinearConnectorError {
    return new LinearConnectorError(
      "NOT_CONNECTED",
      "Linear is not connected. Connect the workspace before using Linear tools.",
    );
  }

  /** NOT_CONNECTED with caller-provided, mode-specific guidance (plan §50). */
  static notConnectedWith(guidance: string): LinearConnectorError {
    return new LinearConnectorError("NOT_CONNECTED", guidance);
  }

  static authExpired(
    message = "The Linear connection has expired. Reconnect to continue.",
  ): LinearConnectorError {
    return new LinearConnectorError("AUTH_EXPIRED", message);
  }

  static authRevoked(
    message = "The Linear connection was revoked. Reconnect to continue.",
  ): LinearConnectorError {
    return new LinearConnectorError("AUTH_REVOKED", message);
  }

  static notFound(kind: string, ref: string): LinearConnectorError {
    return new LinearConnectorError(
      "NOT_FOUND",
      `Linear ${kind} "${ref}" was not found in the connected workspace.`,
    );
  }

  static ambiguous(kind: string, value: string, candidates: string[]): LinearConnectorError {
    const list = candidates.map((candidate) => `- ${candidate}`).join("\n");
    return new LinearConnectorError(
      "AMBIGUOUS_REFERENCE",
      `The ${kind} "${value}" is ambiguous.\nCandidates:\n${list}`,
    );
  }

  static validation(message: string): LinearConnectorError {
    return new LinearConnectorError("VALIDATION_ERROR", message);
  }

  static permissionDenied(
    message = "The Linear connection does not have permission for this operation.",
  ): LinearConnectorError {
    return new LinearConnectorError("PERMISSION_DENIED", message);
  }
}
