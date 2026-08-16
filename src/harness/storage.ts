/**
 * Persistent state adapter (plan §7, §27; Milestone 8).
 *
 * MVP needs no database. When non-secret metadata must persist (connection
 * metadata, workspace ↔ local mappings, webhook delivery marks, agent session
 * maps), it goes through this seam backed by `ctx.storageDomain` — no Prisma /
 * Drizzle / raw SQLite (plan §27).
 *
 * Milestone 8 adds the first real consumer: the agent session map (§42). The
 * harness-backed implementation opens the `dsh-linear` domain on the storage
 * facility (`ctx.storageDomain`, Decision 5) and serves a generic string-keyed
 * JSON table. The storage facility is OPTIONAL in a profile (the base bundle
 * does not mount storage plugins): when it is absent the plugin falls back to
 * the in-memory store and logs a warning — sessions still bridge, but the
 * mapping does not survive a harness restart (§42).
 */
import { z } from "zod";

export interface ConnectorStateStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * The subset of the storage-domain facility the adapter needs. `open` is
 * called once at plugin start; the returned domain is closed by the plugin
 * disposer.
 */
export interface StorageDomainLike {
  open(spec: unknown): Promise<{
    table<N extends string>(
      name: N,
    ): {
      get(key: string): unknown;
      put(key: string, value: unknown): Promise<void>;
      delete(key: string): Promise<boolean>;
    };
  }>;
}

/** Domain name must match the storage backend's unit-name rule. */
export const STATE_DOMAIN_NAME = "dsh-linear";
/** Format version; bump when the record layout changes incompatibly. */
export const STATE_DOMAIN_VERSION = 1;

/** The JSON table name inside the domain. */
const KV_TABLE = "kv";

/** Record schema for the state table: opaque JSON values (lossless-JSON
 * enforced by the storage layer at the durable boundary). */
const kvValueSchema = z.record(z.string(), z.unknown());

/** The `dsh-linear` domain spec consumed by `ctx.storageDomain.open`. */
export const STATE_DOMAIN_SPEC = {
  name: STATE_DOMAIN_NAME,
  version: STATE_DOMAIN_VERSION,
  tables: { [KV_TABLE]: { valueSchema: kvValueSchema } },
};

/**
 * `ctx.storageDomain`-backed store: a single JSON table under the
 * `dsh-linear` domain. Values must be lossless-JSON (the storage layer
 * validates records at the durable boundary). When the domain cannot be
 * opened (storage facility misconfigured), operations degrade to an
 * in-memory overlay — the plugin keeps working, only restart durability is
 * lost (plan §42).
 */
export class HarnessConnectorStateStore implements ConnectorStateStore {
  private table:
    | {
        get(key: string): unknown;
        put(key: string, value: unknown): Promise<void>;
        delete(key: string): Promise<boolean>;
      }
    | undefined;
  private readonly memory = new Map<string, unknown>();

  constructor(private readonly facility: StorageDomainLike) {}

  /** Open the domain and resolve the table; called once by the plugin. */
  async open(): Promise<void> {
    const domain = await this.facility.open(STATE_DOMAIN_SPEC);
    this.table = domain.table(KV_TABLE);
  }

  async get<T>(key: string): Promise<T | undefined> {
    if (this.table) return this.table.get(key) as T | undefined;
    return this.memory.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (this.table) {
      await this.table.put(key, value);
    } else {
      this.memory.set(key, value);
    }
  }

  async delete(key: string): Promise<void> {
    if (this.table) {
      await this.table.delete(key);
    } else {
      this.memory.delete(key);
    }
  }
}

/** In-memory fallback (no storage facility mounted in the profile). */
export class InMemoryConnectorStateStore implements ConnectorStateStore {
  private readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}
