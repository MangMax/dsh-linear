/**
 * Composite metadata resolver (plan §14).
 *
 * Tools take human semantic names and this facade turns them into Linear
 * IDs. Cache policy (§14.2): teams, workflow states, labels, users and
 * projects are cached in memory with a 5-minute TTL by the shared
 * {@link LinearMetadataCatalog}; issue details and comments are never cached
 * here.
 */
import { LinearMetadataCatalog } from "./catalog.ts";
import type { LabelResolver, LabelRef } from "./label.ts";
import { LinearLabelResolver } from "./label.ts";
import type { ProjectResolver, ProjectRef } from "./project.ts";
import { LinearProjectResolver, parseProjectReference, type ProjectReference } from "./project.ts";
import type { WorkflowStateResolver, WorkflowStateRef } from "./state.ts";
import { LinearWorkflowStateResolver } from "./state.ts";
import type { TeamResolver, TeamRef } from "./team.ts";
import { LinearTeamResolver } from "./team.ts";
import type { UserResolver, UserRef } from "./user.ts";
import { LinearUserResolver } from "./user.ts";

/** One shared resolver instance binding all five resolvers to one catalog. */
export class LinearMetadataResolver
  implements TeamResolver, ProjectResolver, WorkflowStateResolver, UserResolver, LabelResolver
{
  /** The shared catalog — also the id → name source for issue mapping (§14.2). */
  readonly catalog: LinearMetadataCatalog;
  readonly teams: TeamResolver;
  readonly projects: ProjectResolver;
  readonly states: WorkflowStateResolver;
  readonly users: UserResolver;
  readonly labels: LabelResolver;

  constructor(catalog: LinearMetadataCatalog) {
    this.catalog = catalog;
    this.teams = new LinearTeamResolver(catalog);
    this.projects = new LinearProjectResolver(catalog);
    this.states = new LinearWorkflowStateResolver(catalog);
    this.users = new LinearUserResolver(catalog);
    this.labels = new LinearLabelResolver(catalog);
  }

  resolveTeam(ref: string): Promise<TeamRef> {
    return this.teams.resolveTeam(ref);
  }

  resolveProject(ref: string): Promise<ProjectRef> {
    return this.projects.resolveProject(ref);
  }

  resolveWorkflowState(teamId: string, ref: string): Promise<WorkflowStateRef> {
    return this.states.resolveWorkflowState(teamId, ref);
  }

  resolveUser(ref: string): Promise<UserRef> {
    return this.users.resolveUser(ref);
  }

  resolveLabels(refs: string[]): Promise<LabelRef[]> {
    return this.labels.resolveLabels(refs);
  }
}

export interface MetadataResolver
  extends TeamResolver, ProjectResolver, WorkflowStateResolver, UserResolver, LabelResolver {}

export type {
  LabelRef,
  LabelResolver,
  ProjectRef,
  ProjectResolver,
  TeamRef,
  TeamResolver,
  UserRef,
  UserResolver,
  WorkflowStateRef,
  WorkflowStateResolver,
};
export { LinearMetadataCatalog, LinearProjectResolver, parseProjectReference };
export type { ProjectReference };
