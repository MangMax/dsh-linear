/**
 * User resolver (plan §14).
 *
 * Resolves human-facing user references ("Mang", "mang@example.com") to
 * stable Linear user IDs with the §14.1 match priority. Ambiguity must
 * surface as an `AMBIGUOUS_REFERENCE` error, never a guess.
 */
import type { LinearMetadataCatalog } from "./catalog.ts";
import { matchByName } from "./matching.ts";

export interface UserRef {
  id: string;
  name: string;
  email?: string;
}

export interface UserResolver {
  resolveUser(ref: string): Promise<UserRef>;
}

/** {@link UserResolver} over the shared metadata catalog. */
export class LinearUserResolver implements UserResolver {
  constructor(private readonly catalog: LinearMetadataCatalog) {}

  async resolveUser(ref: string): Promise<UserRef> {
    const users = await this.catalog.getUsers();
    const hit = matchByName("user", users, ref, [{ field: "email" }]);
    return { id: hit.id, name: hit.name, email: hit.email ?? undefined };
  }
}
