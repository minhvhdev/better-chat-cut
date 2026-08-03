import { searchAssets } from '../../../global-asset-registry/src/asset-search.ts';
import type { AssetResolutionPolicyV1 } from '../contracts/resolution-policy.ts';
import { ASSET_REQUIREMENT_LIMITS } from '../contracts/asset-requirement-set.ts';
import type { AssetResolverDiagnostic } from '../contracts/resolver-errors.ts';
import { diagnostic } from '../contracts/resolver-errors.ts';
import {
  combineCandidateScore,
  jaccard,
  scoreCapability,
  scoreKind,
  scorePreferredAsset,
  scoreStatus,
  scoreTextMatch,
  tieBreakCandidates,
} from '../scoring/index.ts';
import {
  buildQuerySignature,
  hardFilterCandidate,
  type RejectedCandidate,
  type ScoredCandidate,
  type SearchableRequirement,
  type SnapshotAssetRecord,
  type AssetResolutionSnapshot,
  validateDesiredProps,
} from './candidate-filter.ts';
import { stableStringify } from '../schema/requirement-serialization.ts';

export type CandidatePoolResult = {
  accepted: ScoredCandidate[];
  rejected: RejectedCandidate[];
  diagnostics: AssetResolverDiagnostic[];
  evaluations: number;
};

export class CandidateEvaluationBudget {
  private count = 0;
  private readonly limit: number;
  constructor(limit = ASSET_REQUIREMENT_LIMITS.MAX_TOTAL_CANDIDATE_EVALUATIONS) {
    this.limit = limit;
  }
  tryConsume(n = 1): boolean {
    if (this.count + n > this.limit) return false;
    this.count += n;
    return true;
  }
  get used(): number {
    return this.count;
  }
}

export function generateAndScoreCandidates(
  snapshot: AssetResolutionSnapshot,
  req: SearchableRequirement,
  policy: AssetResolutionPolicyV1,
  budget: CandidateEvaluationBudget,
  options?: {
    reuseBonus?: number;
    blockedExactKeys?: Set<string>;
    exactPinMode?: boolean;
    signatureCache?: Map<string, SnapshotAssetRecord[]>;
  },
): CandidatePoolResult {
  const diagnostics: AssetResolverDiagnostic[] = [];
  const rejected: RejectedCandidate[] = [];
  const signature = buildQuerySignature(req);
  let initial: SnapshotAssetRecord[] = [];

  if (options?.exactPinMode && req.exactAsset) {
    const hit = snapshot.assets.find(
      (a) => a.manifest.id === req.exactAsset!.id && a.manifest.version === req.exactAsset!.version,
    );
    if (hit) initial = [hit];
  } else {
    const cached = options?.signatureCache?.get(signature);
    if (cached) {
      initial = cached;
    } else {
      const byKey = new Map<string, SnapshotAssetRecord>();
      const manifests = snapshot.assets.map((a) => a.manifest);
      const recordByKey = new Map(snapshot.assets.map((a) => [`${a.manifest.id}@${a.manifest.version}`, a]));

      if (req.exactAsset) {
        const hit = recordByKey.get(`${req.exactAsset.id}@${req.exactAsset.version}`);
        if (hit) byKey.set(`${hit.manifest.id}@${hit.manifest.version}`, hit);
      }
      for (const preferredId of req.preferredAssetIds ?? []) {
        for (const asset of snapshot.assets) {
          if (asset.manifest.id === preferredId) {
            byKey.set(`${asset.manifest.id}@${asset.manifest.version}`, asset);
          }
        }
      }

      const queries = req.queries.length ? req.queries : [''];
      for (const query of queries) {
        const result = searchAssets(
          manifests,
          {
            query,
            kinds: req.kinds?.allowed as never,
            categories: req.categories,
            tags: req.tags,
            capabilities: req.requiredCapabilities,
            implementationTypes: req.implementationTypes as never,
            statuses: policy.allowedStatuses,
            includeDeprecated: policy.allowDeprecatedExactPin,
            limit: Math.min(50, ASSET_REQUIREMENT_LIMITS.MAX_INITIAL_CANDIDATES_PER_SIGNATURE),
            offset: 0,
          },
          snapshot.catalogRevision,
        );
        for (const item of result.items) {
          const key = `${item.asset.id}@${item.asset.version}`;
          const record = recordByKey.get(key);
          if (record) byKey.set(key, record);
        }
      }

      // Category/tag/capability expansion from full snapshot when filters present
      if ((req.categories?.length || req.tags?.length || req.requiredCapabilities?.length) && byKey.size < 20) {
        for (const asset of snapshot.assets) {
          const m = asset.manifest;
          if (req.categories?.length && !req.categories.some((c) => m.categories.includes(c))) continue;
          if (req.tags?.length && !req.tags.some((t) => m.tags.includes(t))) continue;
          if (req.requiredCapabilities?.length && !req.requiredCapabilities.every((c) => m.capabilities.includes(c))) continue;
          byKey.set(`${m.id}@${m.version}`, asset);
        }
      }

      initial = [...byKey.values()].sort((a, b) => {
        const id = a.manifest.id.localeCompare(b.manifest.id);
        if (id !== 0) return id;
        return a.manifest.version.localeCompare(b.manifest.version);
      });
      if (initial.length > ASSET_REQUIREMENT_LIMITS.MAX_INITIAL_CANDIDATES_PER_SIGNATURE) {
        diagnostics.push(diagnostic('warning', 'ASSET_RESOLVER_CANDIDATE_LIMIT_REACHED', 'Initial candidate pool truncated deterministically', {
          details: { before: initial.length, after: ASSET_REQUIREMENT_LIMITS.MAX_INITIAL_CANDIDATES_PER_SIGNATURE },
        }));
        initial = initial.slice(0, ASSET_REQUIREMENT_LIMITS.MAX_INITIAL_CANDIDATES_PER_SIGNATURE);
      }
      options?.signatureCache?.set(signature, initial);
    }
  }

  const accepted: ScoredCandidate[] = [];
  for (const record of initial) {
    if (!budget.tryConsume(1)) {
      diagnostics.push(diagnostic('error', 'ASSET_RESOLVER_EVALUATION_LIMIT_REACHED', 'Candidate evaluation budget exhausted', {
        recovery: 'Narrow queries or reduce requirement count',
      }));
      break;
    }
    const exactKey = `${record.manifest.id}@${record.manifest.version}`;
    if (options?.blockedExactKeys?.has(exactKey)) {
      rejected.push({
        assetId: record.manifest.id,
        assetVersion: record.manifest.version,
        reasonCodes: ['BLOCKED_ASSET_ID'],
        reasons: [{ code: 'BLOCKED_ASSET_ID', message: 'Already assigned in distinct group' }],
      });
      continue;
    }
    const hard = hardFilterCandidate(record, req, policy, { exactPinMode: options?.exactPinMode });
    if (hard) {
      rejected.push(hard);
      continue;
    }
    const props = validateDesiredProps(record, req.desiredProps);
    if (!props.valid) {
      rejected.push({
        assetId: record.manifest.id,
        assetVersion: record.manifest.version,
        reasonCodes: ['INVALID_DESIRED_PROPS'],
        reasons: [{ code: 'INVALID_DESIRED_PROPS', message: 'Desired props invalid' }],
      });
      continue;
    }

    const text = scoreTextMatch(record.manifest, req.queries);
    const capability = scoreCapability(record.manifest, req.preferredCapabilities ?? []);
    const kind = scoreKind(record.manifest, req.kinds?.preferred, req.kinds?.allowed);
    const category = jaccard(req.categories ?? [], record.manifest.categories);
    const tag = jaccard(req.tags ?? [], record.manifest.tags);
    const style = jaccard(req.styleTags ?? [], record.manifest.styleTags ?? []);
    const preferred = scorePreferredAsset(record.manifest.id, req.preferredAssetIds);
    const status = scoreStatus(
      record.manifest.status,
      Boolean(options?.exactPinMode && policy.allowDeprecatedExactPin),
    );
    const propsScore = req.desiredProps ? 1 : 0.5;
    const reuseBonus = options?.reuseBonus ?? 0.5;
    const semanticScore = combineCandidateScore({
      text: text.score,
      capability: capability.score,
      kind: kind.score,
      category,
      tag,
      style,
      props: propsScore,
      preferredAsset: preferred.score,
      status: status.score,
      reuse: 0.5,
    });
    const score = combineCandidateScore({
      text: text.score,
      capability: capability.score,
      kind: kind.score,
      category,
      tag,
      style,
      props: propsScore,
      preferredAsset: preferred.score,
      status: status.score,
      reuse: reuseBonus,
    });

    const reasons = [
      ...text.reasons,
      ...capability.reasons,
      ...kind.reasons,
      ...preferred.reasons,
      ...status.reasons,
      ...(props.valid ? [{ code: 'DESIRED_PROPS_VALID', message: 'Desired props valid', contribution: propsScore }] : []),
      ...(!props.differsFromDefaults ? [{ code: 'DEFAULT_PROPS_REUSED', message: 'Default props reused' }] : []),
      ...(category > 0 ? [{ code: 'CATEGORY_OVERLAP', message: 'Category overlap', contribution: category }] : []),
      ...(tag > 0 ? [{ code: 'TAG_OVERLAP', message: 'Tag overlap', contribution: tag }] : []),
      ...(style > 0 ? [{ code: 'STYLE_OVERLAP', message: 'Style overlap', contribution: style }] : []),
      ...((req.requiredCapabilities?.length && req.requiredCapabilities.every((c) => record.manifest.capabilities.includes(c)))
        ? [{ code: 'REQUIRED_CAPABILITIES_SATISFIED', message: 'Required capabilities satisfied' }]
        : []),
      ...(reuseBonus > 0.5 ? [{ code: 'REUSE_GROUP_BONUS', message: 'Reuse group bonus', contribution: reuseBonus }] : []),
    ];

    accepted.push({
      record,
      score,
      semanticScore,
      matchedFields: text.matchedFields,
      reasons,
      normalizedProps: props.normalizedProps,
      propsValid: props.valid,
      propsDifferFromDefaults: props.differsFromDefaults,
      exactPin: Boolean(options?.exactPinMode),
      preferred: preferred.score === 1,
      runtimeVerified: record.runtimeAvailable,
      assetId: record.manifest.id,
      assetVersion: record.manifest.version,
      status: record.manifest.status,
    });
  }

  const sorted = tieBreakCandidates(accepted);
  return {
    accepted: sorted,
    rejected,
    diagnostics,
    evaluations: budget.used,
  };
}

export { buildQuerySignature, stableStringify };
