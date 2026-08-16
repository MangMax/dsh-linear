/**
 * User domain service (plan §10.4 surface expansion — list/get users).
 *
 * `listUsers` pages the workspace users; `getUser` resolves a semantic
 * reference (name / email / ID) through the shared {@link UserResolver}
 * (§14.1) and returns the canonical summary. No per-issue follow-ups.
 */
import type { UserSummary } from "../../model/people.ts";
import { normalizeLimit, type PagedResult } from "../../model/pagination.ts";
import { toPagedResult } from "../pagination.ts";
import { LinearConnectorError, normalizeLinearError } from "../error.ts";
import type { LinearClientFactoryLike } from "../client-factory.ts";
import type { UserResolver } from "../resolver/user.ts";

/** Minimal structural view of the SDK User connection row (plan §64). */
export interface SdkUserViewLike {
  id: string;
  name: string;
  email?: string | null;
}

export interface UserService {
  listUsers(options?: { limit?: number; cursor?: string }): Promise<PagedResult<UserSummary>>;
  /** `ref` is a user name, email, or ID. */
  getUser(ref: string): Promise<UserSummary>;
}

export class LinearUserService implements UserService {
  constructor(
    private readonly factory: LinearClientFactoryLike,
    private readonly users: UserResolver,
  ) {}

  async listUsers(
    options: { limit?: number; cursor?: string } = {},
  ): Promise<PagedResult<UserSummary>> {
    const limit = normalizeLimit(options.limit);
    try {
      const client = (await this.factory.create()) as unknown as {
        users(variables: { first: number; after?: string }): Promise<{
          nodes: SdkUserViewLike[];
          pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
        }>;
      };
      const connection = await client.users({ first: limit, after: options.cursor ?? undefined });
      return toPagedResult(
        connection.nodes.map((user) => ({
          id: user.id,
          name: user.name,
          ...(user.email ? { email: user.email } : {}),
        })),
        connection.pageInfo,
      );
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async getUser(ref: string): Promise<UserSummary> {
    try {
      const client = (await this.factory.create()) as unknown as {
        user(id: string): Promise<SdkUserViewLike | undefined>;
      };
      const resolved = await this.users.resolveUser(ref);
      const user = await client.user(resolved.id);
      if (!user) {
        throw LinearConnectorError.notFound("user", ref);
      }
      return {
        id: user.id,
        name: user.name,
        ...(user.email ? { email: user.email } : {}),
      };
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }
}
