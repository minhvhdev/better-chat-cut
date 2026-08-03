export type WorkspaceActionType =
  | 'put-artifact'
  | 'execute-stage'
  | 'approve-review'
  | 'reject-review'
  | 'resume'
  | 'cancel'
  | 'open-project'
  | 'open-edit-session-review'
  | 'download-artifact'
  | 'inspect-connection'
  | 'run-health-check'
  | 'plan-migration'
  | 'apply-migration';

export type WorkspaceActionDescriptorV1 = {
  id: string;
  type: WorkspaceActionType;
  label: string;
  enabled: boolean;
  disabledReason?: string;
  destructive: boolean;
  requiresConfirmation: boolean;
  requiredInputSchema?: Record<string, unknown>;
};
