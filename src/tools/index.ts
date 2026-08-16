/**
 * Tool catalog (plan §10).
 *
 * The MVP keeps the catalog at 11 tools. Deliberately NOT included (§11):
 * raw GraphQL, delete operations, admin tools, bulk mutations.
 *
 * Milestone 2 exports the registry-ready read-tool factories and Milestone 4
 * adds the write-tool factories: `createXxxTool(service)` builds a
 * `defineTool` definition bound to a domain service, used by
 * `src/harness/plugin.ts` and reusable by embedders and tests.
 */
import { addCommentTool } from "./add-comment.ts";
import { createCustomerTool } from "./create-customer.ts";
import { createAttachmentFromUploadTool } from "./create-attachment-from-upload.ts";
import { createInitiativeLabelTool } from "./create-initiative-label.ts";
import { createIssueLabelTool } from "./create-issue-label.ts";
import { createMilestoneTool } from "./create-milestone.ts";
import { deleteAttachmentTool } from "./delete-attachment.ts";
import { deleteCommentTool } from "./delete-comment.ts";
import { deleteCustomerNeedTool } from "./delete-customer-need.ts";
import { deleteCustomerTool } from "./delete-customer.ts";
import { deleteStatusUpdateTool } from "./delete-status-update.ts";
import { getIssueStatusTool } from "./get-issue-status.ts";
import { updateCommentTool } from "./update-comment.ts";
import { updateCustomerTool } from "./update-customer.ts";
import { updateMilestoneTool } from "./update-milestone.ts";
import { updateStatusUpdateTool } from "./update-status-update.ts";
import { createInitiativeTool } from "./create-initiative.ts";
import { createReleaseTool } from "./create-release.ts";
import { createStatusUpdateTool } from "./create-status-update.ts";
import { getCustomerTool } from "./get-customer.ts";
import { getInitiativeTool } from "./get-initiative.ts";
import { getReleaseNoteTool } from "./get-release-note.ts";
import { getReleaseTool } from "./get-release.ts";
import { listCustomersTool } from "./list-customers.ts";
import { listInitiativeLabelsTool } from "./list-initiative-labels.ts";
import { listInitiativesTool } from "./list-initiatives.ts";
import { listReleaseNotesTool } from "./list-release-notes.ts";
import { listReleasePipelinesTool } from "./list-release-pipelines.ts";
import { listReleasesTool } from "./list-releases.ts";
import { prepareAttachmentUploadTool } from "./prepare-attachment-upload.ts";
import { uploadAttachmentFileTool } from "./upload-attachment-file.ts";
import { getDocumentTool } from "./get-document.ts";
import { getMilestoneTool } from "./get-milestone.ts";
import { getProfileTool } from "./get-profile.ts";
import { getStatusUpdateTool } from "./get-status-update.ts";
import { listDocumentsTool } from "./list-documents.ts";
import { listMilestonesTool } from "./list-milestones.ts";
import { listStatusUpdatesTool } from "./list-status-updates.ts";
import { createAttachmentTool } from "./create-attachment.ts";
import { getTeamTool } from "./get-team.ts";
import { getUserTool } from "./get-user.ts";
import { listAttachmentsTool } from "./list-attachments.ts";
import { listCommentsTool } from "./list-comments.ts";
import { listIssueLabelsTool } from "./list-issue-labels.ts";
import { listIssueStatusesTool } from "./list-issue-statuses.ts";
import { listUsersTool } from "./list-users.ts";
import { connectionStatusTool } from "./connection-status.ts";
import { createIssueTool } from "./create-issue.ts";
import { getIssueContextTool } from "./get-issue-context.ts";
import { getIssueTool } from "./get-issue.ts";
import { getProjectTool } from "./get-project.ts";
import { listCyclesTool } from "./list-cycles.ts";
import { listProjectsTool } from "./list-projects.ts";
import { listTeamsTool } from "./list-teams.ts";
import { searchIssuesTool } from "./search-issues.ts";
import { updateIssueTool } from "./update-issue.ts";
import type { ToolSpec } from "./types.ts";

export type { ToolParameterSpec, ToolSpec } from "./types.ts";

export const linearTools: ToolSpec[] = [
  connectionStatusTool,
  searchIssuesTool,
  getIssueTool,
  getIssueContextTool,
  createIssueTool,
  updateIssueTool,
  addCommentTool,
  listProjectsTool,
  getProjectTool,
  listTeamsTool,
  getTeamTool,
  listCyclesTool,
  listUsersTool,
  getUserTool,
  listIssueStatusesTool,
  listIssueLabelsTool,
  listCommentsTool,
  listAttachmentsTool,
  createAttachmentTool,
  getProfileTool,
  listDocumentsTool,
  getDocumentTool,
  listStatusUpdatesTool,
  getStatusUpdateTool,
  createStatusUpdateTool,
  listMilestonesTool,
  getMilestoneTool,
  listInitiativesTool,
  getInitiativeTool,
  listInitiativeLabelsTool,
  createInitiativeTool,
  listReleasesTool,
  getReleaseTool,
  listReleasePipelinesTool,
  listReleaseNotesTool,
  getReleaseNoteTool,
  createReleaseTool,
  listCustomersTool,
  getCustomerTool,
  createCustomerTool,
  createInitiativeLabelTool,
  createIssueLabelTool,
  createMilestoneTool,
  deleteAttachmentTool,
  deleteCommentTool,
  deleteCustomerNeedTool,
  deleteCustomerTool,
  deleteStatusUpdateTool,
  getIssueStatusTool,
  prepareAttachmentUploadTool,
  createAttachmentFromUploadTool,
  uploadAttachmentFileTool,
  updateCommentTool,
  updateCustomerTool,
  updateMilestoneTool,
  updateStatusUpdateTool,
];

export { addCommentTool, createAddCommentTool } from "./add-comment.ts";
export { createAttachmentTool, createCreateAttachmentTool } from "./create-attachment.ts";
export { getTeamTool, createGetTeamTool } from "./get-team.ts";
export { getUserTool, createGetUserTool } from "./get-user.ts";
export { listAttachmentsTool, createListAttachmentsTool } from "./list-attachments.ts";
export { listCommentsTool, createListCommentsTool } from "./list-comments.ts";
export { listIssueLabelsTool, createListIssueLabelsTool } from "./list-issue-labels.ts";
export { listIssueStatusesTool, createListIssueStatusesTool } from "./list-issue-statuses.ts";
export { listUsersTool, createListUsersTool } from "./list-users.ts";
export { createStatusUpdateTool, createCreateStatusUpdateTool } from "./create-status-update.ts";
export { getDocumentTool, createGetDocumentTool } from "./get-document.ts";
export { getMilestoneTool, createGetMilestoneTool } from "./get-milestone.ts";
export { getProfileTool, createGetProfileTool } from "./get-profile.ts";
export { getStatusUpdateTool, createGetStatusUpdateTool } from "./get-status-update.ts";
export { listDocumentsTool, createListDocumentsTool } from "./list-documents.ts";
export { listMilestonesTool, createListMilestonesTool } from "./list-milestones.ts";
export { listStatusUpdatesTool, createListStatusUpdatesTool } from "./list-status-updates.ts";
export { createCustomerTool, createCreateCustomerTool } from "./create-customer.ts";
export { createInitiativeTool, createCreateInitiativeTool } from "./create-initiative.ts";
export { createReleaseTool, createCreateReleaseTool } from "./create-release.ts";
export { getCustomerTool, createGetCustomerTool } from "./get-customer.ts";
export { getInitiativeTool, createGetInitiativeTool } from "./get-initiative.ts";
export { getReleaseNoteTool, createGetReleaseNoteTool } from "./get-release-note.ts";
export { getReleaseTool, createGetReleaseTool } from "./get-release.ts";
export { listCustomersTool, createListCustomersTool } from "./list-customers.ts";
export {
  listInitiativeLabelsTool,
  createListInitiativeLabelsTool,
} from "./list-initiative-labels.ts";
export { listInitiativesTool, createListInitiativesTool } from "./list-initiatives.ts";
export { listReleaseNotesTool, createListReleaseNotesTool } from "./list-release-notes.ts";
export {
  listReleasePipelinesTool,
  createListReleasePipelinesTool,
} from "./list-release-pipelines.ts";
export { listReleasesTool, createListReleasesTool } from "./list-releases.ts";
export {
  prepareAttachmentUploadTool,
  createPrepareAttachmentUploadTool,
} from "./prepare-attachment-upload.ts";
export {
  createInitiativeLabelTool,
  createCreateInitiativeLabelTool,
} from "./create-initiative-label.ts";
export { createIssueLabelTool, createCreateIssueLabelTool } from "./create-issue-label.ts";
export { createMilestoneTool, createCreateMilestoneTool } from "./create-milestone.ts";
export { deleteAttachmentTool, createDeleteAttachmentTool } from "./delete-attachment.ts";
export { deleteCommentTool, createDeleteCommentTool } from "./delete-comment.ts";
export { deleteCustomerNeedTool, createDeleteCustomerNeedTool } from "./delete-customer-need.ts";
export { deleteCustomerTool, createDeleteCustomerTool } from "./delete-customer.ts";
export { deleteStatusUpdateTool, createDeleteStatusUpdateTool } from "./delete-status-update.ts";
export { getIssueStatusTool, createGetIssueStatusTool } from "./get-issue-status.ts";
export { updateCommentTool, createUpdateCommentTool } from "./update-comment.ts";
export { updateCustomerTool, createUpdateCustomerTool } from "./update-customer.ts";
export { updateMilestoneTool, createUpdateMilestoneTool } from "./update-milestone.ts";
export { updateStatusUpdateTool, createUpdateStatusUpdateTool } from "./update-status-update.ts";
export { connectionStatusTool, createConnectionStatusTool } from "./connection-status.ts";
export { createIssueTool, createCreateIssueTool } from "./create-issue.ts";
export { getIssueContextTool, createGetIssueContextTool } from "./get-issue-context.ts";
export { getIssueTool, createGetIssueTool } from "./get-issue.ts";
export { getProjectTool, createGetProjectTool } from "./get-project.ts";
export { listCyclesTool, createListCyclesTool } from "./list-cycles.ts";
export { listProjectsTool, createListProjectsTool } from "./list-projects.ts";
export { listTeamsTool, createListTeamsTool } from "./list-teams.ts";
export { searchIssuesTool, createSearchIssuesTool } from "./search-issues.ts";
export { updateIssueTool, createUpdateIssueTool } from "./update-issue.ts";
