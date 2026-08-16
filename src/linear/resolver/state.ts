/**
 * Workflow state resolver (plan §14).
 *
 * Resolves human-facing status names ("In Progress", "Started") to stable
 * Linear workflow state IDs within a team's workflow. States belong to a
 * single team's workflow, so resolution is always team-scoped: the same name
 * may exist in many teams, and the caller supplies the team context.
 * Ambiguity must surface as an `AMBIGUOUS_REFERENCE` error, never a guess.
 */
import type { LinearMetadataCatalog } from "./catalog.ts";
import { matchByName } from "./matching.ts";

export interface WorkflowStateRef {
  id: string;
  name: string;
  type: string;
}

export interface WorkflowStateResolver {
  resolveWorkflowState(teamId: string, ref: string): Promise<WorkflowStateRef>;
}

/** {@link WorkflowStateResolver} over the shared metadata catalog. */
export class LinearWorkflowStateResolver implements WorkflowStateResolver {
  constructor(private readonly catalog: LinearMetadataCatalog) {}

  async resolveWorkflowState(teamId: string, ref: string): Promise<WorkflowStateRef> {
    const states = await this.catalog.getStates(teamId);
    return matchByName("workflow state", states, ref);
  }
}
