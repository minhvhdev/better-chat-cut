export function computeDependencyDiff(previous: number, next: number): { previousDependencies: number; nextDependencies: number } {
  return { previousDependencies: previous, nextDependencies: next };
}
