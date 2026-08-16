/**
 * Canonical Project DTOs (plan §10.8, §10.9).
 *
 * Only the fields an Agent actually needs: name, description, status, lead,
 * teams, target date, progress, and a LIMITED list of recent updates.
 */

export interface ProjectLeadSummary {
  id: string;
  name: string;
}

export interface ProjectTeamSummary {
  id: string;
  key: string;
  name: string;
}

export interface ProjectUpdateSummary {
  id: string;
  body: string;
  createdAt: string;
  author?: {
    id: string;
    name: string;
  };
}

export interface ProjectSummary {
  id: string;
  name: string;
  url: string;
  status?: string;
  lead?: ProjectLeadSummary;
  teams: ProjectTeamSummary[];
  targetDate?: string;
  /** 0..100 completion percentage, when Linear reports one. */
  progress?: number;
}

export interface ProjectDetail extends ProjectSummary {
  description?: string;
  /** Always capped to a small window (e.g. 5); never the full history. */
  recentUpdates: ProjectUpdateSummary[];
}
