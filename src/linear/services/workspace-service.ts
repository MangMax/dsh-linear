/**
 * Workspace domain service (plan §10.1).
 *
 * {@link LinearWorkspaceService} is the M2 implementation over
 * {@link LinearClientFactoryLike}: workspace identity comes from
 * `client.organization`, the current user from `client.viewer`. Connection
 * status never leaks tokens.
 */
import type {
  AuthMode,
  ConnectionStatus,
  ViewerInfo,
  WorkspaceInfo,
} from "../../model/connection.ts";
import { normalizeLinearError } from "../error.ts";
import type { LinearClientFactoryLike } from "../client-factory.ts";

export interface WorkspaceService {
  getWorkspace(): Promise<WorkspaceInfo>;
  getViewer(): Promise<ViewerInfo>;
}

export interface ConnectionStatusService {
  getConnectionStatus(): Promise<ConnectionStatus>;
}

export class LinearWorkspaceService implements WorkspaceService, ConnectionStatusService {
  constructor(
    private readonly factory: LinearClientFactoryLike,
    private readonly authMode: AuthMode,
  ) {}

  async getWorkspace(): Promise<WorkspaceInfo> {
    try {
      const client = await this.factory.create();
      const organization = await client.organization;
      return { id: organization.id, name: organization.name };
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  async getViewer(): Promise<ViewerInfo> {
    try {
      const client = await this.factory.create();
      const viewer = await client.viewer;
      return { id: viewer.id, name: viewer.name, email: viewer.email };
    } catch (err) {
      throw normalizeLinearError(err);
    }
  }

  /**
   * Never throws: the model needs a yes/no answer plus facts, not a stack
   * trace. Any failure — missing credential, network, revoked token — yields
   * `connected: false`.
   */
  async getConnectionStatus(): Promise<ConnectionStatus> {
    try {
      const [workspace, viewer] = await Promise.all([this.getWorkspace(), this.getViewer()]);
      return { connected: true, authMode: this.authMode, workspace, viewer };
    } catch {
      return { connected: false, authMode: this.authMode };
    }
  }
}
