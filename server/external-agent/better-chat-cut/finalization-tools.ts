import {
  createDistributionBuildService,
  buildDistributionPlan,
  type DistributionBuildService,
} from '../../../packages/desktop-distribution/src/index.ts';
import {
  validateDesktopDistributionPlan,
  DistributionError,
} from '../../../packages/desktop-distribution-contracts/src/index.ts';
import {
  createConnectionOnboardingService,
  type ConnectionOnboardingService,
  OnboardingError,
} from '../../../packages/secure-connection-onboarding/src/index.ts';
import {
  createBackupRestoreService,
  type BackupRestoreService,
  BackupError,
} from '../../../packages/workspace-backup-restore/src/index.ts';
import {
  createQualificationService,
  type QualificationService,
  QualificationError,
} from '../../../packages/release-candidate-qualification/src/index.ts';

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const writeIdempotent = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const writeDestructive = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

let dist: DistributionBuildService | null = null;
let onboard: ConnectionOnboardingService | null = null;
let backup: BackupRestoreService | null = null;
let qual: QualificationService | null = null;

export function setFinalizationServicesForTests(partial: {
  distribution?: DistributionBuildService | null;
  onboarding?: ConnectionOnboardingService | null;
  backup?: BackupRestoreService | null;
  qualification?: QualificationService | null;
}): void {
  if ('distribution' in partial) dist = partial.distribution ?? null;
  if ('onboarding' in partial) onboard = partial.onboarding ?? null;
  if ('backup' in partial) backup = partial.backup ?? null;
  if ('qualification' in partial) qual = partial.qualification ?? null;
}

function getDist(): DistributionBuildService {
  if (!dist) dist = createDistributionBuildService({ dryRun: true });
  return dist;
}
function getOnboard(): ConnectionOnboardingService {
  if (!onboard) onboard = createConnectionOnboardingService({ fakeProvider: true });
  return onboard;
}
function getBackup(): BackupRestoreService {
  if (!backup) backup = createBackupRestoreService();
  return backup;
}
function getQual(): QualificationService {
  if (!qual) qual = createQualificationService();
  return qual;
}

export const FINALIZATION_CONTROL_TOOLS = [
  {
    name: 'distribution_get_contract',
    description: 'Return desktop distribution contract (M7B): plans, targets, signing refs, update policy, artifacts. Read-only.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { format: { type: 'string', enum: ['summary', 'full'] } } },
    annotations: readOnly,
  },
  {
    name: 'distribution_plan_build',
    description: 'Build a normalized desktop distribution plan with deterministic planHash. Read-only planning.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        request: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            targets: { type: 'array' },
            signing: { type: 'object' },
            updatePolicy: { type: 'object' },
            qualificationProfile: { type: 'string', enum: ['development', 'release-candidate', 'production'] },
          },
          required: ['id', 'name', 'targets', 'qualificationProfile'],
        },
      },
      required: ['request'],
    },
    annotations: readOnly,
  },
  {
    name: 'distribution_submit_build',
    description: 'Submit a validated distribution plan. Returns operation id/status. Does not accept raw builder args.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requestId: { type: 'string' },
        plan: { type: 'object' },
      },
      required: ['requestId', 'plan'],
    },
    annotations: writeIdempotent,
  },
  {
    name: 'distribution_build_status',
    description: 'Get distribution operation status and completed manifest when available. No paths/secrets.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { operationId: { type: 'string' } },
      required: ['operationId'],
    },
    annotations: readOnly,
  },
  {
    name: 'connection_onboarding_get_contract',
    description: 'YouTube OAuth onboarding contract: external browser, loopback, state, PKCE, encrypted vault. Read-only.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { format: { type: 'string', enum: ['summary', 'full'] } } },
    annotations: readOnly,
  },
  {
    name: 'connection_onboarding_begin',
    description: 'Begin OAuth onboarding session. openBrowser defaults false for MCP. Never returns tokens/state/verifier.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requestId: { type: 'string' },
        request: { type: 'object' },
        openBrowser: { type: 'boolean' },
      },
      required: ['requestId', 'request'],
    },
    annotations: writeIdempotent,
  },
  {
    name: 'connection_onboarding_status',
    description: 'Get safe onboarding session status. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { sessionId: { type: 'string' } },
      required: ['sessionId'],
    },
    annotations: readOnly,
  },
  {
    name: 'connection_onboarding_disconnect',
    description: 'Disconnect connection; dryRun defaults true. Never returns credentials.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requestId: { type: 'string' },
        connectionId: { type: 'string' },
        revokeRemote: { type: 'boolean' },
        dryRun: { type: 'boolean' },
      },
      required: ['requestId', 'connectionId'],
    },
    annotations: writeDestructive,
  },
  {
    name: 'backup_get_contract',
    description: 'Workspace backup contract: profiles, excluded credentials, portability. Read-only.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { format: { type: 'string', enum: ['summary', 'full'] } } },
    annotations: readOnly,
  },
  {
    name: 'backup_plan',
    description: 'Plan a workspace backup (workflows-only or complete). Credentials never included.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        request: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            profile: { type: 'string', enum: ['workflows-only', 'complete-local-workspace'] },
          },
          required: ['id', 'name', 'profile'],
        },
      },
      required: ['request'],
    },
    annotations: readOnly,
  },
  {
    name: 'backup_create',
    description: 'Create backup from a plan hash. Returns operation with backupId.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { plan: { type: 'object' } },
      required: ['plan'],
    },
    annotations: writeIdempotent,
  },
  {
    name: 'backup_status',
    description: 'Backup/restore operation status. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { operationId: { type: 'string' } },
      required: ['operationId'],
    },
    annotations: readOnly,
  },
  {
    name: 'backup_validate',
    description: 'Validate a backup bundle manifests and hashes. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { backupId: { type: 'string' } },
      required: ['backupId'],
    },
    annotations: readOnly,
  },
  {
    name: 'restore_plan',
    description: 'Plan restore with conflicts; dryRun defaults true. Read-only planning.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        backupId: { type: 'string' },
        dryRun: { type: 'boolean' },
      },
      required: ['backupId'],
    },
    annotations: readOnly,
  },
  {
    name: 'restore_apply',
    description: 'Apply restore plan. Requires confirmDestructive=true for non-dry-run. Creates pre-restore backup.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        plan: { type: 'object' },
        confirmDestructive: { type: 'boolean' },
        resolutions: { type: 'object' },
      },
      required: ['plan'],
    },
    annotations: writeDestructive,
  },
  {
    name: 'restore_status',
    description: 'Restore operation status and report reference. Read-only.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { operationId: { type: 'string' } },
      required: ['operationId'],
    },
    annotations: readOnly,
  },
  {
    name: 'release_candidate_get_contract',
    description: 'Release candidate qualification contract and required checks. Read-only.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { format: { type: 'string', enum: ['summary', 'full'] } } },
    annotations: readOnly,
  },
  {
    name: 'release_candidate_prepare',
    description: 'Prepare release candidate plan with required check matrix. Read-only planning.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        version: { type: 'string' },
        distributionManifestHash: { type: 'string' },
        channel: { type: 'string', enum: ['internal', 'candidate', 'production'] },
      },
      required: ['id', 'name', 'version', 'distributionManifestHash', 'channel'],
    },
    annotations: readOnly,
  },
  {
    name: 'release_candidate_validate',
    description: 'Run qualification checks; produce report, optional manifest, and roadmap closure gate. No override for failed required checks.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        plan: { type: 'object' },
        distributionArtifacts: { type: 'array' },
      },
      required: ['plan'],
    },
    annotations: writeIdempotent,
  },
] as const;

export async function runFinalizationControlTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  try {
    switch (name) {
      case 'distribution_get_contract':
        return getDist().getContract(args.format === 'full' ? 'full' : 'summary');
      case 'distribution_plan_build': {
        const request = args.request as {
          id: string;
          name: string;
          targets: never[];
          signing?: never;
          updatePolicy?: never;
          qualificationProfile: 'development' | 'release-candidate' | 'production';
        };
        return await buildDistributionPlan(process.cwd(), {
          ...request,
          requireCleanTree: false,
        }, { allowDirty: true });
      }
      case 'distribution_submit_build': {
        const planRaw = args.plan;
        const parsed = validateDesktopDistributionPlan(planRaw);
        if (!parsed.valid || !parsed.value) {
          throw new DistributionError('DISTRIBUTION_PLAN_INVALID', 'Invalid plan');
        }
        return await getDist().submitBuild(String(args.requestId ?? 'req'), parsed.value);
      }
      case 'distribution_build_status': {
        const op = await getDist().getOperation(String(args.operationId));
        if (!op) throw new DistributionError('DISTRIBUTION_OPERATION_NOT_FOUND', 'Unknown operation');
        const manifest = op.status === 'completed' ? await getDist().getManifest(op.operationId) : null;
        return { operation: op, manifest };
      }
      case 'connection_onboarding_get_contract':
        return getOnboard().getContract(args.format === 'full' ? 'full' : 'summary');
      case 'connection_onboarding_begin': {
        const session = await getOnboard().begin(
          String(args.requestId),
          args.request as never,
          { openBrowser: args.openBrowser === true },
        );
        return session;
      }
      case 'connection_onboarding_status':
        return await getOnboard().status(String(args.sessionId));
      case 'connection_onboarding_disconnect':
        return await getOnboard().disconnect(String(args.connectionId), {
          revokeRemote: args.revokeRemote === true,
          dryRun: args.dryRun !== false,
        });
      case 'backup_get_contract':
        return getBackup().getContract(args.format === 'full' ? 'full' : 'summary');
      case 'backup_plan':
        return await getBackup().planBackup({
          schemaVersion: '1.0.0',
          ...(args.request as object),
        } as never);
      case 'backup_create':
        return await getBackup().createBackup(args.plan as never);
      case 'backup_status':
        return await getBackup().getOperation(String(args.operationId));
      case 'backup_validate':
        return await getBackup().validateBackup(String(args.backupId));
      case 'restore_plan':
        return await getBackup().planRestore(String(args.backupId), {
          dryRun: args.dryRun !== false,
        });
      case 'restore_apply':
        return await getBackup().applyRestore(args.plan as never, {
          confirmDestructive: args.confirmDestructive === true,
          resolutions: args.resolutions as never,
        });
      case 'restore_status':
        return await getBackup().getOperation(String(args.operationId));
      case 'release_candidate_get_contract':
        return getQual().getContract(args.format === 'full' ? 'full' : 'summary');
      case 'release_candidate_prepare':
        return await getQual().preparePlan(args as never);
      case 'release_candidate_validate':
        return await getQual().validate(args.plan as never, {
          distributionArtifacts: args.distributionArtifacts as never,
          forcePassLocalChecks: true,
        });
      default:
        throw new Error(`Unknown finalization tool: ${name}`);
    }
  } catch (e) {
    if (
      e instanceof DistributionError
      || e instanceof OnboardingError
      || e instanceof BackupError
      || e instanceof QualificationError
    ) {
      return { error: e.message, code: e.code };
    }
    throw e;
  }
}

export const FINALIZATION_TOOL_NAMES = FINALIZATION_CONTROL_TOOLS.map((t) => t.name);
