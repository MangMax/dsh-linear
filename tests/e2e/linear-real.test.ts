/**
 * Real Linear workspace E2E (plan §54, Milestone 7).
 *
 * OPTIONAL — runs only when `LINEAR_TEST_API_KEY` is set (a dedicated test
 * workspace with a fixed TEST project / TEST label; never a production key;
 * plan §58). CI runs this on the main / scheduled branches when the secret
 * exists (plan §54); local runs skip silently without it.
 *
 * Drives the connector's own domain services through the real API:
 * create issue → get issue → update issue → comment → search (plan §54).
 * The connector deliberately exposes no delete tool (§11, §36), so the test
 * cleans up its own issue through the raw SDK afterwards.
 */
import { describe, expect, test } from "vite-plus/test";
import { LinearClient } from "@linear/sdk";
import type { LinearAuth, ResolvedLinearAuth } from "../../src/auth/auth-service.ts";
import { LinearClientFactory } from "../../src/linear/client-factory.ts";
import { LinearMetadataCatalog } from "../../src/linear/resolver/catalog.ts";
import { LinearMetadataResolver } from "../../src/linear/resolver/index.ts";
import { LinearCommentService } from "../../src/linear/services/comment-service.ts";
import { LinearIssueService } from "../../src/linear/services/issue-service.ts";

const API_KEY = process.env.LINEAR_TEST_API_KEY;

class TestKeyAuth implements LinearAuth {
  readonly mode = "apiKey" as const;
  constructor(private readonly key: string) {}
  async resolve(): Promise<ResolvedLinearAuth> {
    return { type: "apiKey", apiKey: this.key };
  }
  async getValidAccessToken(): Promise<string> {
    return this.key;
  }
  async disconnect(): Promise<void> {}
}

describe.runIf(!!API_KEY)("real Linear E2E (plan §54)", () => {
  test("create → get → update → comment → search on the connector services", async () => {
    const key = API_KEY!;
    const factory = new LinearClientFactory(new TestKeyAuth(key));
    const catalog = new LinearMetadataCatalog(factory);
    const resolver = new LinearMetadataResolver(catalog);
    const issues = new LinearIssueService(factory, resolver, {});
    const comments = new LinearCommentService(factory);

    // Setup: pick the first team of the dedicated test workspace.
    const sdk = new LinearClient({ apiKey: key });
    const teams = await sdk.teams();
    const team = teams.nodes[0];
    expect(team, "the test workspace must contain at least one team").toBeDefined();

    const title = `dsh-linear-e2e ${Date.now()}`;
    let createdId: string | undefined;

    try {
      // 1. create issue (semantic team name — resolver resolves it).
      const created = await issues.createIssue({ title, team: team.key });
      createdId = created.id;
      expect(created.identifier).toMatch(/^[A-Z]+-\d+$/);
      expect(created.title).toBe(title);

      // 2. get issue
      const got = await issues.getIssue(created.identifier);
      expect(got.id).toBe(created.id);
      expect(got.title).toBe(title);

      // 3. update issue (explicit fields only)
      const updatedTitle = `${title} updated`;
      const updated = await issues.updateIssue({
        issue: created.identifier,
        title: updatedTitle,
        priority: "high",
      });
      expect(updated.title).toBe(updatedTitle);
      expect(updated.priority).toMatchObject({ value: 2 }); // high = 2

      // 4. comment
      const added = await comments.addComment({
        issue: created.identifier,
        body: "e2e comment from dsh-linear",
      });
      expect(added.body).toBe("e2e comment from dsh-linear");
      expect(added.id).toBeTruthy();

      // 5. search (free text finds the unique title)
      const results = await issues.searchIssues({ query: title, limit: 10 });
      expect(results.items.some((item) => item.identifier === created.identifier)).toBe(true);
    } finally {
      // Cleanup is test-only — the connector itself has no delete tool (§36).
      // ARCHIVE, not delete: verified against the live API that issueDelete
      // reports success while the issue remains resolvable, whereas
      // issueArchive lands immediately (archiving also releases the active
      // issue count on free-plan workspaces).
      if (createdId) {
        try {
          await sdk.archiveIssue(createdId);
        } catch {
          // best-effort; the dedicated workspace is swept periodically
        }
      }
    }
  }, 60_000);
});
