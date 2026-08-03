import assert from 'node:assert/strict';
import { SCENE_BINDING_TOOLS, runSceneBindingTool } from './scene-binding-tools.ts';
import { SCENE_CLIP_TOOL_SCHEMAS } from '../../../src/agent/tools/schemas/scene-clip-tools.ts';
import { isExternalDraftTool, isExternalReadTool } from '../../../src/agent/external-tool-policy.ts';
import { externalToolSchemas } from '../../../src/agent/external-tool-schemas.ts';
import { mcpTools } from '../mcp.ts';
import {
  registerEditor,
  resetExternalAgentBrokerForTest,
  unregisterEditor,
} from '../broker.ts';

const expectedControl = ['scene_binding_get_contract', 'scene_draft_get_binding_payload'];
const expectedEditor = SCENE_CLIP_TOOL_SCHEMAS.map((tool) => tool.name);

for (const name of expectedControl) {
  assert.ok(SCENE_BINDING_TOOLS.some((tool) => tool.name === name), name);
}

resetExternalAgentBrokerForTest();
registerEditor('project-scene-clip-verify', 'editor-scene-clip-verify', 'v1', externalToolSchemas());

const listed = mcpTools().map((tool) => tool.name);
for (const name of [...expectedControl, ...expectedEditor]) {
  assert.ok(listed.includes(name), `tools/list missing ${name}`);
}

const contract = await runSceneBindingTool('scene_binding_get_contract', { format: 'summary' }) as {
  templateId: string;
  reservedPropsKey: string;
  schemaVersion: string;
};
assert.equal(contract.templateId, 'better-chat-cut.scene-v1');
assert.equal(contract.reservedPropsKey, '__betterChatCutScene');
assert.equal(contract.schemaVersion, '1.0.0');

assert.equal(isExternalReadTool('scene_clip_list'), true);
assert.equal(isExternalReadTool('scene_clip_get'), true);
assert.equal(isExternalReadTool('scene_clip_compare'), true);
assert.equal(isExternalReadTool('scene_clip_validate'), true);
assert.equal(isExternalDraftTool('scene_clip_bind'), true);
assert.equal(isExternalDraftTool('scene_clip_sync'), true);

unregisterEditor('project-scene-clip-verify', 'editor-scene-clip-verify');
resetExternalAgentBrokerForTest();

console.log('scene-clip-tools.verify: ok');
