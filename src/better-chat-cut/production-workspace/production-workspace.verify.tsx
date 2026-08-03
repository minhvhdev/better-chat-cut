// UI contract surface without mounting React DOM (tsx unit gate)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseWorkspaceHash, workspaceHash, loadWorkspacePrefs } from './production-workspace-state.ts';
import { productionWorkspaceApi } from './production-workspace-api.ts';

assert.deepEqual(parseWorkspaceHash('#/production-workspace'), { page: 'overview' });
assert.deepEqual(parseWorkspaceHash('#/production-workspace/reviews'), { page: 'reviews' });
assert.deepEqual(parseWorkspaceHash('#/production-workspace/production/run-1'), {
  page: 'production',
  runId: 'run-1',
});
assert.deepEqual(parseWorkspaceHash('#/production-workspace/publishing/pub-1'), {
  page: 'publishing',
  runId: 'pub-1',
});
assert.equal(workspaceHash({ page: 'health' }), '#/production-workspace/health');
assert.equal(
  workspaceHash({ page: 'production', runId: 'a/b' }),
  `#/production-workspace/production/${encodeURIComponent('a/b')}`,
);

const prefs = loadWorkspacePrefs();
assert.equal(prefs.schemaVersion, '1.0.0');
assert.ok(!('token' in prefs));
assert.ok(!('apiKey' in prefs));

assert.equal(typeof productionWorkspaceApi.getOverview, 'function');
assert.equal(typeof productionWorkspaceApi.executeCommand, 'function');
assert.equal(typeof productionWorkspaceApi.exportDiagnostics, 'function');
assert.equal(typeof productionWorkspaceApi.getHealth, 'function');

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, 'styles/production-workspace.css'), 'utf8');
assert.ok(css.includes('prefers-reduced-motion'));
assert.ok(css.includes(':focus-visible'));
assert.ok(css.includes('bcc-ws-badge'));

const mainSrc = readFileSync(join(here, 'ProductionWorkspace.tsx'), 'utf8');
assert.ok(mainSrc.includes('WorkspaceShell'));
assert.ok(mainSrc.includes('ReviewDecisionPanel') || mainSrc.includes('Review'));
assert.ok(mainSrc.includes('productionWorkspaceApi'));
assert.ok(mainSrc.includes('Create production run'));

const sharedSrc = readFileSync(join(here, 'components/shared.tsx'), 'utf8');
assert.ok(sharedSrc.includes('StatusBadge'));
assert.ok(sharedSrc.includes('EmptyState'));
assert.ok(sharedSrc.includes('ErrorState'));
assert.ok(sharedSrc.includes('DiagnosticList'));
assert.ok(sharedSrc.includes('ReviewDecisionPanel'));

const app = readFileSync(join(here, '../../App.tsx'), 'utf8');
assert.ok(app.includes('production-workspace'));
assert.ok(app.includes('ProductionWorkspace'));

console.log('production-workspace UI verification passed');
