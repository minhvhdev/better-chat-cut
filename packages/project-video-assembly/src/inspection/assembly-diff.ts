export function diffAssemblyStatus(before: string, after: string): { changed: boolean; from: string; to: string } {
  return { changed: before !== after, from: before, to: after };
}
