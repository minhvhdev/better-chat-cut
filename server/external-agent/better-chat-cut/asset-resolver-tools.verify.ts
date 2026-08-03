import assert from 'node:assert/strict';
import { mcpTools } from '../mcp.ts';
import { runAssetResolverTool } from './asset-resolver-tools.ts';
import { runCatalogTool } from './asset-search.ts';
import { runSceneTool } from './scene-tools.ts';

const names = mcpTools().map((tool) => tool.name);
for (const name of [
  'asset_resolver_get_contract',
  'asset_requirements_validate',
  'asset_resolve_batch',
  'asset_plan_validate',
  'asset_search',
  'scene_get_contract',
]) {
  assert.ok(names.includes(name), `missing ${name}`);
}

{
  const contract = await runAssetResolverTool('asset_resolver_get_contract', { format: 'full' }) as {
    requirementSchemaVersion: string;
    exampleDirectRequirementSet: unknown;
    scoringWeights: Record<string, number>;
  };
  assert.equal(contract.requirementSchemaVersion, '1.0.0');
  assert.ok(contract.exampleDirectRequirementSet);
  assert.ok(contract.scoringWeights.text);

  const invalid = await runAssetResolverTool('asset_requirements_validate', {
    requirementSet: { schemaVersion: '9.0.0', id: 'bad', requirements: [] },
  }) as { valid: boolean; errors: Array<{ code: string }> };
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.length);

  const validSet = {
    schemaVersion: '1.0.0',
    id: 'requirements.mcp-arrow',
    requirements: [{
      id: 'arrow',
      name: 'Arrow',
      description: 'Arrow',
      search: { queries: ['arrow'] },
    }],
  };
  const validated = await runAssetResolverTool('asset_requirements_validate', {
    requirementSet: validSet,
    includeNormalizedRequirementSet: true,
  }) as { valid: boolean; requirementSetHash: string };
  assert.equal(validated.valid, true);

  const resolved = await runAssetResolverTool('asset_resolve_batch', {
    requirementSet: validSet,
  }) as {
    plan: {
      planHash: string;
      decisions: Array<{ selection?: { asset: { id: string; version: string } } }>;
    };
    catalogRevision: string;
    resolverRevision: string;
  };
  assert.ok(resolved.plan.planHash);
  assert.equal(resolved.plan.decisions[0]?.selection?.asset.id, 'primitive.arrow');
  assert.equal(JSON.stringify(resolved).includes('C:\\\\'), false);
  assert.ok(resolved.plan.decisions[0]?.selection?.asset.id);

  const resolved2 = await runAssetResolverTool('asset_resolve_batch', { requirementSet: validSet }) as {
    plan: { planHash: string };
  };
  assert.equal(resolved.plan.planHash, resolved2.plan.planHash);

  const planOk = await runAssetResolverTool('asset_plan_validate', { plan: resolved.plan }) as {
    valid: boolean;
    planHashValid: boolean;
  };
  assert.equal(planOk.valid, true);
  assert.equal(planOk.planHashValid, true);
}

// Prior tools still work
{
  const search = await runCatalogTool('asset_search', { query: 'arrow' });
  assert.ok(search);
  const scene = await runSceneTool('scene_get_contract', { format: 'summary' });
  assert.ok(scene);
}

console.log('asset-resolver-tools.verify: ok');
