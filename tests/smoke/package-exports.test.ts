/**
 * Package surface smoke test.
 *
 * Verifies the public entry (`src/index.ts`) exports the Cordis plugin entry
 * and the complete MVP tool catalog — the minimum contract the DSH bundle
 * loader and the model depend on. The full harness install smoke
 * (`dsh plugin add <tgz>` against a temp DSH_HOME) lives in CI (plan §53.4).
 */
import { expect, test } from "vite-plus/test";
import { apply, inject, name, linearTools } from "../../src/index.ts";

test("plugin entry is exported for the bundle loader", () => {
  expect(name).toBe("linear");
  expect(inject).toContain("tools");
  expect(inject).toContain("credentials");
  expect(typeof apply).toBe("function");
});

test("tool catalog contains the 56-tool Codex-aligned surface", () => {
  const names = linearTools.map((tool) => tool.name).sort();
  expect(names).toEqual([
    "linear_add_comment",
    "linear_connection_status",
    "linear_create_attachment",
    "linear_create_attachment_from_upload",
    "linear_create_customer",
    "linear_create_initiative",
    "linear_create_initiative_label",
    "linear_create_issue",
    "linear_create_issue_label",
    "linear_create_milestone",
    "linear_create_release",
    "linear_create_status_update",
    "linear_delete_attachment",
    "linear_delete_comment",
    "linear_delete_customer",
    "linear_delete_customer_need",
    "linear_delete_status_update",
    "linear_get_customer",
    "linear_get_document",
    "linear_get_initiative",
    "linear_get_issue",
    "linear_get_issue_context",
    "linear_get_issue_status",
    "linear_get_milestone",
    "linear_get_profile",
    "linear_get_project",
    "linear_get_release",
    "linear_get_release_note",
    "linear_get_status_update",
    "linear_get_team",
    "linear_get_user",
    "linear_list_attachments",
    "linear_list_comments",
    "linear_list_customers",
    "linear_list_cycles",
    "linear_list_documents",
    "linear_list_initiative_labels",
    "linear_list_initiatives",
    "linear_list_issue_labels",
    "linear_list_issue_statuses",
    "linear_list_milestones",
    "linear_list_projects",
    "linear_list_release_notes",
    "linear_list_release_pipelines",
    "linear_list_releases",
    "linear_list_status_updates",
    "linear_list_teams",
    "linear_list_users",
    "linear_prepare_attachment_upload",
    "linear_search_issues",
    "linear_update_comment",
    "linear_update_customer",
    "linear_update_issue",
    "linear_update_milestone",
    "linear_update_status_update",
    "linear_upload_attachment_file",
  ]);
});
