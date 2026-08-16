/**
 * Agent session mapping (plan §42; Milestone 8).
 *
 * Persisted via `ctx.storageDomain` (through the {@link ConnectorStateStore}
 * seam) so a harness restart can still find the harness session behind a
 * Linear agent session. The mapping is written before the harness session is
 * dispatched and `touch`ed on every turn, so it is also the idempotency and
 * deduplication source for redelivered Linear webhooks.
 *
 * Layout: two keys per mapping — the canonical entry keyed by
 * `linearAgentSessionId` and a reverse index keyed by `harnessSessionId`
 * (lookup on resume after a harness restart).
 */
import type { ConnectorStateStore } from "../harness/storage.ts";

/** One persisted Linear ↔ harness session mapping (plan §42, exact shape). */
export interface AgentSessionMap {
  linearAgentSessionId: string;
  linearIssueId: string;
  harnessSessionId: string;
  createdAt: string;
  updatedAt: string;
}

const ENTRY_PREFIX = "agent-session-map:linear:";
const INDEX_PREFIX = "agent-session-map:harness:";

export interface AgentSessionMapStore {
  /** Persist a mapping; overwrites an existing entry with the same linear id. */
  create(entry: AgentSessionMap): Promise<void>;
  getByLinearAgentSessionId(linearAgentSessionId: string): Promise<AgentSessionMap | undefined>;
  getByHarnessSessionId(harnessSessionId: string): Promise<AgentSessionMap | undefined>;
  /** Bump `updatedAt`; no-op when the linear id has no mapping. */
  touch(linearAgentSessionId: string, at?: Date): Promise<void>;
  /** Remove the mapping and its reverse index. */
  remove(linearAgentSessionId: string): Promise<void>;
}

/** Persistent store over the {@link ConnectorStateStore} seam (storageDomain
 * when mounted, in-memory otherwise — both satisfy the same interface). */
export class PersistentAgentSessionMapStore implements AgentSessionMapStore {
  constructor(private readonly store: ConnectorStateStore) {}

  async create(entry: AgentSessionMap): Promise<void> {
    await Promise.all([
      this.store.set(ENTRY_PREFIX + entry.linearAgentSessionId, entry),
      this.store.set(INDEX_PREFIX + entry.harnessSessionId, entry),
    ]);
  }

  async getByLinearAgentSessionId(
    linearAgentSessionId: string,
  ): Promise<AgentSessionMap | undefined> {
    return this.store.get<AgentSessionMap>(ENTRY_PREFIX + linearAgentSessionId);
  }

  async getByHarnessSessionId(harnessSessionId: string): Promise<AgentSessionMap | undefined> {
    return this.store.get<AgentSessionMap>(INDEX_PREFIX + harnessSessionId);
  }

  async touch(linearAgentSessionId: string, at: Date = new Date()): Promise<void> {
    const entry = await this.getByLinearAgentSessionId(linearAgentSessionId);
    if (!entry) return;
    const updated = { ...entry, updatedAt: at.toISOString() };
    await Promise.all([
      this.store.set(ENTRY_PREFIX + entry.linearAgentSessionId, updated),
      this.store.set(INDEX_PREFIX + entry.harnessSessionId, updated),
    ]);
  }

  async remove(linearAgentSessionId: string): Promise<void> {
    const entry = await this.getByLinearAgentSessionId(linearAgentSessionId);
    if (!entry) return;
    await Promise.all([
      this.store.delete(ENTRY_PREFIX + entry.linearAgentSessionId),
      this.store.delete(INDEX_PREFIX + entry.harnessSessionId),
    ]);
  }
}

/** In-memory fallback when no storage backend is mounted (plan §27 按需启用). */
export class InMemoryAgentSessionMapStore implements AgentSessionMapStore {
  private readonly entries = new Map<string, AgentSessionMap>();
  private readonly index = new Map<string, AgentSessionMap>();

  async create(entry: AgentSessionMap): Promise<void> {
    this.entries.set(entry.linearAgentSessionId, entry);
    this.index.set(entry.harnessSessionId, entry);
  }

  async getByLinearAgentSessionId(
    linearAgentSessionId: string,
  ): Promise<AgentSessionMap | undefined> {
    return this.entries.get(linearAgentSessionId);
  }

  async getByHarnessSessionId(harnessSessionId: string): Promise<AgentSessionMap | undefined> {
    return this.index.get(harnessSessionId);
  }

  async touch(linearAgentSessionId: string, at: Date = new Date()): Promise<void> {
    const entry = this.entries.get(linearAgentSessionId);
    if (!entry) return;
    const updated = { ...entry, updatedAt: at.toISOString() };
    this.entries.set(updated.linearAgentSessionId, updated);
    this.index.set(updated.harnessSessionId, updated);
  }

  async remove(linearAgentSessionId: string): Promise<void> {
    const entry = this.entries.get(linearAgentSessionId);
    if (!entry) return;
    this.entries.delete(entry.linearAgentSessionId);
    this.index.delete(entry.harnessSessionId);
  }
}
