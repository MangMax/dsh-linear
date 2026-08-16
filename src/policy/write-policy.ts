/**
 * Write policy (plan §36).
 *
 * Read tools run automatically; write tools are gated by the configured
 * policy (`ask` by default, `allow`, `deny`). The policy is pipeline-level:
 * tools stay pure, and future write tools need no per-tool approval code.
 *
 * Milestone 4 wires this into the harness tool pipeline (`tools.guard` /
 * `restrict`, §37); until then it is pure logic that the plugin and tests
 * can both rely on.
 */
import type { WritePolicy } from "../model/connection.ts";

export const READ_TOOL_NAMES = new Set([
  "linear_connection_status",
  "linear_search_issues",
  "linear_get_issue",
  "linear_get_issue_context",
  "linear_list_projects",
  "linear_get_project",
  "linear_list_teams",
  "linear_get_team",
  "linear_list_cycles",
  "linear_list_users",
  "linear_get_user",
  "linear_list_issue_statuses",
  "linear_list_issue_labels",
  "linear_list_comments",
  "linear_list_attachments",
  "linear_get_profile",
  "linear_list_documents",
  "linear_get_document",
  "linear_list_status_updates",
  "linear_get_status_update",
  "linear_list_milestones",
  "linear_get_milestone",
  "linear_list_initiatives",
  "linear_get_initiative",
  "linear_list_initiative_labels",
  "linear_list_releases",
  "linear_get_release",
  "linear_list_release_pipelines",
  "linear_list_release_notes",
  "linear_get_release_note",
  "linear_list_customers",
  "linear_get_customer",
]);

export const WRITE_TOOL_NAMES = new Set([
  "linear_create_issue",
  "linear_update_issue",
  "linear_add_comment",
  "linear_create_attachment",
  "linear_create_status_update",
  "linear_create_initiative",
  "linear_create_release",
  "linear_create_customer",
  "linear_prepare_attachment_upload",
  "linear_create_attachment_from_upload",
  "linear_upload_attachment_file",
]);

export function isWriteTool(name: string): boolean {
  return WRITE_TOOL_NAMES.has(name);
}

export function isReadTool(name: string): boolean {
  return READ_TOOL_NAMES.has(name);
}

export type WriteDecision = "allow" | "ask" | "deny";

/** Decide how a tool invocation must be gated. */
export function evaluateWritePolicy(policy: WritePolicy, toolName: string): WriteDecision {
  if (!isWriteTool(toolName)) {
    return "allow";
  }
  if (policy === "allow" || policy === "deny") {
    return policy;
  }
  return "ask";
}
