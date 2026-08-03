export { createSceneLayoutAnalyzer, analyzeSceneLayout } from './scene-layout-analyzer.ts';

export function analyzeSceneTiming() {
  return { note: 'Timing diagnostics are produced during validation' };
}

export function collectSceneDiagnostics() {
  return { note: 'Use SceneValidator and layout analyzer' };
}
