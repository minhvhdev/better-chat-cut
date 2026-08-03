import type { AssetRequirementV1 } from '../contracts/asset-requirement.ts';
import type { AssetRequirementSetV1 } from '../contracts/asset-requirement-set.ts';
import type { AssetPlanV1, AssetPlanWithoutHash } from '../contracts/asset-plan.ts';
import type { AssetResolutionDecisionV1 } from '../contracts/resolution-decision.ts';
import type { AssetCompositionRecipeV1 } from '../contracts/composition-recipe.ts';
import type {
  AssetResolutionCandidateSummaryV1,
  AssetRejectedCandidateSummaryV1,
  ResolvedAssetSelectionV1,
} from '../contracts/resolution-candidate.ts';
import type { AssetResolutionPolicyV1 } from '../contracts/resolution-policy.ts';
import type { AssetResolverDiagnostic } from '../contracts/resolver-errors.ts';
import { diagnostic } from '../contracts/resolver-errors.ts';
import { ASSET_PLAN_SCHEMA_VERSION } from '../contracts/asset-plan.ts';
import { computeAssetPlanHash, computeAssetRequirementSetHash } from '../schema/requirement-hash.ts';
import { mergePolicy } from '../schema/requirement-validator.ts';
import {
  CandidateEvaluationBudget,
  generateAndScoreCandidates,
  type AssetResolutionSnapshot,
  type ScoredCandidate,
  type SearchableRequirement,
} from '../candidates/index.ts';
import {
  clampScore,
  confidenceFor,
} from '../scoring/candidate-score.ts';
import {
  COMPOSITION_PART_COMPLEXITY_PENALTY,
  COMPOSITION_SWITCH_MARGIN,
  OPTIONAL_PART_WEIGHT,
  REQUIRED_PART_WEIGHT,
} from '../scoring/scoring-constants.ts';
import { buildCreationBrief, runDuplicateReview } from '../duplicates/index.ts';

const PRIORITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

function toSearchable(req: AssetRequirementV1 | {
  search: AssetRequirementV1['search'];
  kinds?: AssetRequirementV1['kinds'];
  requiredCapabilities?: string[];
  preferredCapabilities?: string[];
  categories?: string[];
  tags?: string[];
  styleTags?: string[];
  implementationTypes?: AssetRequirementV1['implementationTypes'];
  preferredAssetIds?: string[];
  blockedAssetIds?: string[];
  exactAsset?: AssetRequirementV1['exactAsset'];
  desiredProps?: Record<string, unknown>;
  fitHint?: AssetRequirementV1['fitHint'];
}): SearchableRequirement {
  return {
    queries: req.search.queries,
    aliases: req.search.aliases,
    kinds: req.kinds,
    requiredCapabilities: req.requiredCapabilities,
    preferredCapabilities: req.preferredCapabilities,
    categories: req.categories,
    tags: req.tags,
    styleTags: req.styleTags,
    implementationTypes: req.implementationTypes,
    preferredAssetIds: req.preferredAssetIds,
    blockedAssetIds: req.blockedAssetIds,
    exactAsset: req.exactAsset,
    desiredProps: req.desiredProps,
    fitHint: req.fitHint,
  };
}

function selectionFromCandidate(
  candidate: ScoredCandidate,
  policy: AssetResolutionPolicyV1,
  fitHint: 'contain' | 'cover' | 'stretch' = 'contain',
  exact = false,
): ResolvedAssetSelectionV1 {
  const confidence = confidenceFor(candidate.score, policy.minimumScore, exact) ?? 'low';
  return {
    asset: {
      id: candidate.record.manifest.id,
      version: candidate.record.manifest.version,
      name: candidate.record.manifest.name,
      kind: candidate.record.manifest.kind,
      status: candidate.record.manifest.status,
      contentHash: candidate.record.contentHash,
      ...(candidate.record.implementationFingerprint
        ? { implementationFingerprint: candidate.record.implementationFingerprint }
        : {}),
      implementationType: candidate.record.manifest.implementation.type,
      runtimeAvailable: candidate.record.runtimeAvailable,
    },
    props: candidate.normalizedProps,
    fitHint,
    score: candidate.score,
    confidence,
    matchedFields: candidate.matchedFields,
    reasons: exact
      ? [{ code: 'EXACT_ASSET_PIN', message: 'Exact asset pin', contribution: 1 }, ...candidate.reasons]
      : candidate.reasons,
  };
}

function summarizeCandidates(
  accepted: ScoredCandidate[],
  policy: AssetResolutionPolicyV1,
  limit: number,
): AssetResolutionCandidateSummaryV1[] {
  return accepted.slice(0, limit).map((c) => ({
    assetId: c.assetId,
    assetVersion: c.assetVersion,
    score: c.score,
    confidence: confidenceFor(c.score, policy.minimumScore, c.exactPin) ?? 'low',
    status: c.status,
    kind: c.record.manifest.kind,
    runtimeAvailable: c.runtimeVerified,
    matchedFields: c.matchedFields,
    reasons: c.reasons,
  }));
}

function summarizeRejected(
  rejected: ReturnType<typeof generateAndScoreCandidates>['rejected'],
  limit: number,
): AssetRejectedCandidateSummaryV1[] {
  return rejected.slice(0, limit).map((r) => ({
    assetId: r.assetId,
    assetVersion: r.assetVersion,
    reasonCodes: r.reasonCodes,
    reasons: r.reasons,
  }));
}

function planningOrder(requirements: AssetRequirementV1[]): AssetRequirementV1[] {
  return [...requirements].sort((a, b) => {
    const aExact = a.exactAsset ? 0 : 1;
    const bExact = b.exactAsset ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    const pa = PRIORITY_RANK[a.priority ?? 'normal'] ?? 2;
    const pb = PRIORITY_RANK[b.priority ?? 'normal'] ?? 2;
    if (pa !== pb) return pa - pb;
    const ai = requirements.indexOf(a);
    const bi = requirements.indexOf(b);
    if (ai !== bi) return ai - bi;
    return a.id.localeCompare(b.id);
  });
}

function resolveComposition(
  requirement: AssetRequirementV1,
  policy: AssetResolutionPolicyV1,
  snapshot: AssetResolutionSnapshot,
  budget: CandidateEvaluationBudget,
  signatureCache: Map<string, import('../candidates/index.ts').SnapshotAssetRecord[]>,
  blockedExactKeys: Set<string>,
): { recipe?: AssetCompositionRecipeV1; diagnostics: AssetResolverDiagnostic[]; score: number } {
  const diagnostics: AssetResolverDiagnostic[] = [];
  if (!requirement.composition) {
    return { diagnostics, score: 0 };
  }
  if (!policy.allowComposition) {
    diagnostics.push(diagnostic('error', 'ASSET_RESOLVER_COMPOSITION_TOO_COMPLEX', 'Composition disabled by policy', {
      requirementId: requirement.id,
    }));
    return { diagnostics, score: 0 };
  }
  if (requirement.composition.parts.length > policy.maximumCompositionParts) {
    diagnostics.push(diagnostic('error', 'ASSET_RESOLVER_COMPOSITION_TOO_COMPLEX', 'Too many composition parts for policy', {
      requirementId: requirement.id,
    }));
    return { diagnostics, score: 0 };
  }

  const resolvedParts: AssetCompositionRecipeV1['parts'] = [];
  const unresolvedOptional: string[] = [];
  let weighted = 0;
  let weightSum = 0;

  const parts = [...requirement.composition.parts].sort((a, b) => {
    const oa = a.order ?? 0;
    const ob = b.order ?? 0;
    if (oa !== ob) return oa - ob;
    return a.id.localeCompare(b.id);
  });

  for (const part of parts) {
    const required = part.required !== false;
    const partPolicy = policy;
    const pool = generateAndScoreCandidates(
      snapshot,
      toSearchable(part),
      partPolicy,
      budget,
      {
        signatureCache,
        blockedExactKeys,
        exactPinMode: Boolean(part.exactAsset),
      },
    );
    diagnostics.push(...pool.diagnostics);
    const best = pool.accepted.find((c) => c.semanticScore >= policy.minimumScore && c.score >= policy.minimumScore);
    if (!best) {
      if (required) {
        diagnostics.push(diagnostic('error', 'ASSET_RESOLVER_COMPOSITION_REQUIRED_PART_MISSING', `Required composition part "${part.id}" unresolved`, {
          requirementId: requirement.id,
          partId: part.id,
        }));
        return { diagnostics, score: 0 };
      }
      unresolvedOptional.push(part.id);
      continue;
    }
    const weight = required ? REQUIRED_PART_WEIGHT : OPTIONAL_PART_WEIGHT;
    weighted += best.score * weight;
    weightSum += weight;
    resolvedParts.push({
      partId: part.id,
      role: part.role,
      required,
      order: part.order ?? resolvedParts.length,
      ...(part.parentPartId ? { parentPartId: part.parentPartId } : {}),
      ...(part.normalizedBox ? { normalizedBox: part.normalizedBox } : {}),
      selection: selectionFromCandidate(best, policy, part.fitHint ?? requirement.fitHint ?? 'contain', Boolean(part.exactAsset)),
    });
  }

  if (!resolvedParts.length) {
    diagnostics.push(diagnostic('error', 'ASSET_RESOLVER_COMPOSITION_REQUIRED_PART_MISSING', 'No composition parts resolved', {
      requirementId: requirement.id,
    }));
    return { diagnostics, score: 0 };
  }

  const avg = weightSum > 0 ? weighted / weightSum : 0;
  const score = clampScore(avg - ((resolvedParts.length - 1) * COMPOSITION_PART_COMPLEXITY_PENALTY));
  if (score < policy.minimumScore) {
    diagnostics.push(diagnostic('error', 'ASSET_RESOLVER_COMPOSITION_SCORE_TOO_LOW', 'Composition score below minimum', {
      requirementId: requirement.id,
      details: { score },
    }));
    return { diagnostics, score };
  }

  const confidence = confidenceFor(score, policy.minimumScore) ?? 'low';
  return {
    recipe: {
      schemaVersion: '1.0.0',
      requirementId: requirement.id,
      layoutHint: requirement.composition.layoutHint,
      parts: resolvedParts,
      score,
      confidence,
      unresolvedOptionalParts: unresolvedOptional,
      diagnostics,
    },
    diagnostics,
    score,
  };
}

function emptyDecision(requirement: AssetRequirementV1): AssetResolutionDecisionV1 {
  return {
    requirementId: requirement.id,
    ...(requirement.scope ? { scope: requirement.scope } : {}),
    priority: requirement.priority ?? 'normal',
    optional: requirement.optional === true,
    status: 'unresolved',
    strategy: 'none',
    diagnostics: [],
  };
}

export function planBatch(
  requirementSet: AssetRequirementSetV1,
  snapshot: AssetResolutionSnapshot,
  callOptions?: {
    includeCandidates?: boolean;
    includeRejectedCandidates?: boolean;
    candidateLimit?: number;
    rejectedCandidateLimit?: number;
  },
): AssetPlanV1 {
  const diagnostics: AssetResolverDiagnostic[] = [];
  const budget = new CandidateEvaluationBudget();
  const signatureCache = new Map();
  const decisions = new Map<string, AssetResolutionDecisionV1>();
  const assignedByRequirement = new Map<string, string>(); // requirementId -> id@version
  const distinctUsed = new Map<string, Set<string>>(); // distinctKey -> used exact keys

  const ordered = planningOrder(requirementSet.requirements);

  // Pre-group reuse keys
  const reuseGroups = new Map<string, AssetRequirementV1[]>();
  for (const req of requirementSet.requirements) {
    if (!req.reuseKey) continue;
    const list = reuseGroups.get(req.reuseKey) ?? [];
    list.push(req);
    reuseGroups.set(req.reuseKey, list);
  }

  const reuseAssignments = new Map<string, ScoredCandidate>(); // reuseKey -> candidate

  for (const [reuseKey, group] of [...reuseGroups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const policies = group.map((req) => mergePolicy(requirementSet.defaultPolicy, req.policy, {
      ...(callOptions?.includeCandidates !== undefined ? { includeCandidates: callOptions.includeCandidates } : {}),
      ...(callOptions?.includeRejectedCandidates !== undefined ? { includeRejectedCandidates: callOptions.includeRejectedCandidates } : {}),
      ...(callOptions?.candidateLimit !== undefined ? { candidateLimit: callOptions.candidateLimit } : {}),
      ...(callOptions?.rejectedCandidateLimit !== undefined ? { rejectedCandidateLimit: callOptions.rejectedCandidateLimit } : {}),
    }));
    const preference = policies[0]?.reusePreference ?? 'balanced';
    if (preference === 'none') continue;

    // Intersection candidates: score first requirement then filter by all hard constraints
    const primary = group[0];
    const primaryPolicy = policies[0];
    const pool = generateAndScoreCandidates(
      snapshot,
      toSearchable(primary),
      primaryPolicy,
      budget,
      { signatureCache },
    );
    diagnostics.push(...pool.diagnostics);

    const perRequirementPools = group.map((req, idx) => generateAndScoreCandidates(
      snapshot,
      toSearchable(req),
      policies[idx],
      budget,
      { signatureCache, exactPinMode: Boolean(req.exactAsset) },
    ));
    diagnostics.push(...perRequirementPools.flatMap((p) => p.diagnostics));

    const shared = pool.accepted.filter((candidate) => {
      if (candidate.semanticScore < primaryPolicy.minimumScore) return false;
      return perRequirementPools.every((reqPool, idx) => {
        const policy = policies[idx];
        return reqPool.accepted.some(
          (c) => c.assetId === candidate.assetId
            && c.assetVersion === candidate.assetVersion
            && c.semanticScore >= policy.minimumScore,
        );
      });
    });

    shared.sort((a, b) => {
      const scoreFor = (candidate: typeof a) => {
        const scores = perRequirementPools.map((reqPool) => (
          reqPool.accepted.find((c) => c.assetId === candidate.assetId && c.assetVersion === candidate.assetVersion)?.score ?? 0
        ));
        return { min: Math.min(...scores), avg: scores.reduce((x, y) => x + y, 0) / scores.length };
      };
      const sa = scoreFor(a);
      const sb = scoreFor(b);
      if (sb.min !== sa.min) return sb.min - sa.min;
      if (sb.avg !== sa.avg) return sb.avg - sa.avg;
      return b.score - a.score;
    });

    if (shared[0]) {
      reuseAssignments.set(reuseKey, shared[0]);
    } else if (preference === 'strong') {
      for (const req of group) {
        const decision = emptyDecision(req);
        decision.status = 'blocked';
        decision.strategy = 'none';
        decision.diagnostics.push(diagnostic('error', 'ASSET_RESOLVER_REUSE_GROUP_INCOMPATIBLE', `Reuse group "${reuseKey}" has no shared candidate`, {
          requirementId: req.id,
          recovery: 'Relax hard constraints or set reusePreference=balanced',
        }));
        decisions.set(req.id, decision);
      }
    } else {
      diagnostics.push(diagnostic('warning', 'ASSET_RESOLVER_REUSE_GROUP_INCOMPATIBLE', `Reuse group "${reuseKey}" falling back to individual resolution`, {
        details: { reuseKey },
      }));
    }
  }

  for (const requirement of ordered) {
    if (decisions.has(requirement.id)) continue;

    const policy = mergePolicy(requirementSet.defaultPolicy, requirement.policy, {
      ...(callOptions?.includeCandidates !== undefined ? { includeCandidates: callOptions.includeCandidates } : {}),
      ...(callOptions?.includeRejectedCandidates !== undefined ? { includeRejectedCandidates: callOptions.includeRejectedCandidates } : {}),
      ...(callOptions?.candidateLimit !== undefined ? { candidateLimit: callOptions.candidateLimit } : {}),
      ...(callOptions?.rejectedCandidateLimit !== undefined ? { rejectedCandidateLimit: callOptions.rejectedCandidateLimit } : {}),
    });

    const decision = emptyDecision(requirement);
    const blockedKeys = requirement.distinctKey
      ? (distinctUsed.get(requirement.distinctKey) ?? new Set<string>())
      : new Set<string>();

    // Exact pin
    if (requirement.exactAsset) {
      const pool = generateAndScoreCandidates(
        snapshot,
        toSearchable(requirement),
        policy,
        budget,
        { signatureCache, exactPinMode: true, blockedExactKeys: blockedKeys },
      );
      decision.diagnostics.push(...pool.diagnostics);
      if (policy.includeCandidates) decision.candidates = summarizeCandidates(pool.accepted, policy, policy.candidateLimit);
      if (policy.includeRejectedCandidates) {
        decision.rejectedCandidates = summarizeRejected(pool.rejected, policy.rejectedCandidateLimit);
      }
      const best = pool.accepted[0];
      if (!best) {
        decision.status = 'blocked';
        decision.strategy = 'exact';
        decision.diagnostics.push(diagnostic('error', 'ASSET_RESOLVER_NO_CANDIDATES', 'Exact asset pin could not be resolved', {
          requirementId: requirement.id,
          assetId: requirement.exactAsset.id,
          assetVersion: requirement.exactAsset.version,
          recovery: 'Fix exact pin or status/runtime availability',
        }));
        decisions.set(requirement.id, decision);
        continue;
      }
      decision.status = 'resolved';
      decision.strategy = 'exact';
      decision.score = best.score;
      decision.confidence = 'exact';
      decision.selection = selectionFromCandidate(best, policy, requirement.fitHint ?? 'contain', true);
      assignedByRequirement.set(requirement.id, `${best.assetId}@${best.assetVersion}`);
      if (requirement.distinctKey) {
        const set = distinctUsed.get(requirement.distinctKey) ?? new Set();
        set.add(`${best.assetId}@${best.assetVersion}`);
        distinctUsed.set(requirement.distinctKey, set);
      }
      decisions.set(requirement.id, decision);
      continue;
    }

    // Reuse group assignment
    if (requirement.reuseKey && reuseAssignments.has(requirement.reuseKey)) {
      const shared = reuseAssignments.get(requirement.reuseKey)!;
      const pool = generateAndScoreCandidates(
        snapshot,
        toSearchable(requirement),
        policy,
        budget,
        { signatureCache, reuseBonus: 1, blockedExactKeys: blockedKeys },
      );
      const matched = pool.accepted.find((c) => c.assetId === shared.assetId && c.assetVersion === shared.assetVersion)
        ?? shared;
      decision.status = 'resolved';
      decision.strategy = matched.propsDifferFromDefaults && policy.allowVariant ? 'variant' : 'reuse';
      decision.score = matched.score;
      decision.confidence = confidenceFor(matched.score, policy.minimumScore) ?? 'low';
      decision.selection = selectionFromCandidate(
        { ...matched, normalizedProps: matched.normalizedProps },
        policy,
        requirement.fitHint ?? 'contain',
      );
      if (policy.includeCandidates) decision.candidates = summarizeCandidates(pool.accepted, policy, policy.candidateLimit);
      assignedByRequirement.set(requirement.id, `${matched.assetId}@${matched.assetVersion}`);
      if (requirement.distinctKey) {
        const set = distinctUsed.get(requirement.distinctKey) ?? new Set();
        set.add(`${matched.assetId}@${matched.assetVersion}`);
        distinctUsed.set(requirement.distinctKey, set);
      }
      decisions.set(requirement.id, decision);
      continue;
    }

    const mode = requirement.mode ?? 'direct';
    let directBest: ScoredCandidate | undefined;
    let directPool = generateAndScoreCandidates(
      snapshot,
      toSearchable(requirement),
      policy,
      budget,
      { signatureCache, blockedExactKeys: blockedKeys },
    );
    decision.diagnostics.push(...directPool.diagnostics);
    if (policy.includeCandidates) {
      decision.candidates = summarizeCandidates(directPool.accepted, policy, policy.candidateLimit);
    }
    if (policy.includeRejectedCandidates) {
      decision.rejectedCandidates = summarizeRejected(directPool.rejected, policy.rejectedCandidateLimit);
    }
    directBest = directPool.accepted.find((c) => c.semanticScore >= policy.minimumScore && c.score >= policy.minimumScore);

    let compositionResult: ReturnType<typeof resolveComposition> | undefined;
    if (mode === 'composition' || mode === 'direct-or-composition') {
      compositionResult = resolveComposition(
        requirement,
        policy,
        snapshot,
        budget,
        signatureCache,
        blockedKeys,
      );
      decision.diagnostics.push(...compositionResult.diagnostics);
    }

    if (mode === 'composition') {
      if (compositionResult?.recipe) {
        decision.status = compositionResult.recipe.unresolvedOptionalParts.length ? 'partially-resolved' : 'resolved';
        decision.strategy = 'composition';
        decision.score = compositionResult.score;
        decision.confidence = compositionResult.recipe.confidence;
        decision.composition = compositionResult.recipe;
        for (const part of compositionResult.recipe.parts) {
          assignedByRequirement.set(`${requirement.id}:${part.partId}`, `${part.selection.asset.id}@${part.selection.asset.version}`);
        }
      } else if (requirement.optional) {
        decision.status = 'skipped';
        decision.strategy = 'none';
      } else {
        // fall through to duplicate/create
        Object.assign(decision, finalizeUnresolved(requirement, policy, snapshot, decision));
      }
      decisions.set(requirement.id, decision);
      continue;
    }

    if (mode === 'direct-or-composition') {
      const directScore = directBest?.score ?? 0;
      const compositionOk = Boolean(compositionResult?.recipe);
      const compositionScore = compositionResult?.score ?? 0;
      const preferDirect = directBest
        && (
          directScore >= policy.directPreferenceThreshold
          || !compositionOk
          || compositionScore < directScore + COMPOSITION_SWITCH_MARGIN
        );
      if (preferDirect && directBest) {
        decision.status = 'resolved';
        decision.strategy = directBest.propsDifferFromDefaults && policy.allowVariant ? 'variant' : 'reuse';
        decision.score = directBest.score;
        decision.confidence = confidenceFor(directBest.score, policy.minimumScore) ?? 'low';
        decision.selection = selectionFromCandidate(directBest, policy, requirement.fitHint ?? 'contain');
        assignedByRequirement.set(requirement.id, `${directBest.assetId}@${directBest.assetVersion}`);
        if (requirement.distinctKey) {
          const set = distinctUsed.get(requirement.distinctKey) ?? new Set();
          set.add(`${directBest.assetId}@${directBest.assetVersion}`);
          distinctUsed.set(requirement.distinctKey, set);
        }
        decisions.set(requirement.id, decision);
        continue;
      }
      if (compositionOk && compositionResult?.recipe) {
        decision.status = compositionResult.recipe.unresolvedOptionalParts.length ? 'partially-resolved' : 'resolved';
        decision.strategy = 'composition';
        decision.score = compositionResult.score;
        decision.confidence = compositionResult.recipe.confidence;
        decision.composition = compositionResult.recipe;
        decisions.set(requirement.id, decision);
        continue;
      }
    }

    if (directBest) {
      decision.status = 'resolved';
      decision.strategy = directBest.propsDifferFromDefaults && policy.allowVariant ? 'variant' : 'reuse';
      decision.score = directBest.score;
      decision.confidence = confidenceFor(directBest.score, policy.minimumScore) ?? 'low';
      decision.selection = selectionFromCandidate(directBest, policy, requirement.fitHint ?? 'contain');
      assignedByRequirement.set(requirement.id, `${directBest.assetId}@${directBest.assetVersion}`);
      if (requirement.distinctKey) {
        const set = distinctUsed.get(requirement.distinctKey) ?? new Set();
        set.add(`${directBest.assetId}@${directBest.assetVersion}`);
        distinctUsed.set(requirement.distinctKey, set);
      }
      decisions.set(requirement.id, decision);
      continue;
    }

    if (requirement.distinctKey && directPool.accepted.length && blockedKeys.size) {
      // Check if distinct made it impossible
      const withoutDistinct = generateAndScoreCandidates(
        snapshot,
        toSearchable(requirement),
        policy,
        budget,
        { signatureCache },
      );
      if (withoutDistinct.accepted.some((c) => c.score >= policy.minimumScore)) {
        decision.diagnostics.push(diagnostic('error', 'ASSET_RESOLVER_DISTINCT_GROUP_CONFLICT', `Distinct group "${requirement.distinctKey}" exhausted available assets`, {
          requirementId: requirement.id,
        }));
      }
    }

    Object.assign(decision, finalizeUnresolved(requirement, policy, snapshot, decision));
    decisions.set(requirement.id, decision);
  }

  // Preserve input order in plan decisions
  const orderedDecisions = requirementSet.requirements.map((req) => decisions.get(req.id) ?? emptyDecision(req));
  return buildPlan(requirementSet, snapshot, orderedDecisions, diagnostics, assignedByRequirement);
}

function finalizeUnresolved(
  requirement: AssetRequirementV1,
  policy: AssetResolutionPolicyV1,
  snapshot: AssetResolutionSnapshot,
  decision: AssetResolutionDecisionV1,
): AssetResolutionDecisionV1 {
  if (requirement.optional) {
    decision.status = 'skipped';
    decision.strategy = 'none';
    const duplicateReview = runDuplicateReview(requirement, snapshot);
    decision.duplicateReview = duplicateReview;
    if (policy.allowCreationBrief && !duplicateReview.blocksCreationBrief) {
      decision.creationBrief = buildCreationBrief(requirement, snapshot, duplicateReview);
    }
    return decision;
  }

  const duplicateReview = runDuplicateReview(requirement, snapshot);
  decision.duplicateReview = duplicateReview;
  if (duplicateReview.blocksCreationBrief) {
    decision.status = 'blocked';
    decision.strategy = 'review-duplicate';
    decision.diagnostics.push(diagnostic('error', 'ASSET_RESOLVER_DUPLICATE_REVIEW_REQUIRED', 'Likely duplicate assets found; review before creating', {
      requirementId: requirement.id,
      recovery: 'Reuse or variant an existing asset, or explicitly resolve the duplicate review',
    }));
    return decision;
  }

  if (policy.allowCreationBrief) {
    decision.status = 'unresolved';
    decision.strategy = 'create-new';
    decision.creationBrief = buildCreationBrief(requirement, snapshot, duplicateReview);
    decision.diagnostics.push(diagnostic('info', 'ASSET_RESOLVER_BELOW_MINIMUM_SCORE', 'No candidate met minimum score; creation brief provided', {
      requirementId: requirement.id,
    }));
    return decision;
  }

  decision.status = 'unresolved';
  decision.strategy = 'none';
  decision.diagnostics.push(diagnostic('error', 'ASSET_RESOLVER_BELOW_MINIMUM_SCORE', 'No candidate met minimum score', {
    requirementId: requirement.id,
  }));
  return decision;
}

function buildPlan(
  requirementSet: AssetRequirementSetV1,
  snapshot: AssetResolutionSnapshot,
  decisions: AssetResolutionDecisionV1[],
  diagnostics: AssetResolverDiagnostic[],
  assignedByRequirement: Map<string, string>,
): AssetPlanV1 {
  const assetKeys = [...assignedByRequirement.values()];
  const unique = new Set(assetKeys);
  const counts = new Map<string, number>();
  for (const key of assetKeys) counts.set(key, (counts.get(key) ?? 0) + 1);
  let reusedAssignments = 0;
  for (const n of counts.values()) {
    if (n > 1) reusedAssignments += n - 1;
  }

  const summary = {
    totalRequirements: decisions.length,
    resolved: decisions.filter((d) => d.status === 'resolved').length,
    partiallyResolved: decisions.filter((d) => d.status === 'partially-resolved').length,
    unresolved: decisions.filter((d) => d.status === 'unresolved').length,
    blocked: decisions.filter((d) => d.status === 'blocked').length,
    skipped: decisions.filter((d) => d.status === 'skipped').length,
    exact: decisions.filter((d) => d.strategy === 'exact').length,
    reused: decisions.filter((d) => d.strategy === 'reuse').length,
    variants: decisions.filter((d) => d.strategy === 'variant').length,
    compositions: decisions.filter((d) => d.strategy === 'composition').length,
    duplicateReviews: decisions.filter((d) => d.strategy === 'review-duplicate').length,
    creationBriefs: decisions.filter((d) => d.creationBrief).length,
    uniqueAssets: unique.size,
    reusedAssetAssignments: reusedAssignments,
  };

  const complete = decisions.every((d) => (
    d.status === 'resolved'
    || d.status === 'partially-resolved'
    || d.status === 'skipped'
    || (d.optional && (d.status === 'unresolved' || d.status === 'blocked'))
  )) && decisions.filter((d) => !d.optional).every((d) => (
    d.status === 'resolved' || d.status === 'partially-resolved'
  ));

  const idTail = requirementSet.id.includes('.')
    ? requirementSet.id.slice(requirementSet.id.indexOf('.') + 1)
    : requirementSet.id;

  const withoutHash: AssetPlanWithoutHash = {
    schemaVersion: ASSET_PLAN_SCHEMA_VERSION,
    id: `asset-plan.${idTail}`,
    requirementSetId: requirementSet.id,
    requirementSetHash: computeAssetRequirementSetHash(requirementSet),
    catalogRevision: snapshot.catalogRevision,
    motionRuntimeRevision: snapshot.motionRuntimeRevision,
    resolverRevision: snapshot.resolverRevision,
    ...(requirementSet.theme ? { theme: requirementSet.theme } : {}),
    complete,
    decisions,
    summary,
    diagnostics,
  };

  return {
    ...withoutHash,
    planHash: computeAssetPlanHash(withoutHash),
  };
}
