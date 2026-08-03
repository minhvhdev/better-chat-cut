export function sanitizePartId(partId: string): string {
  return partId.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'part';
}

export function buildPartNodeId(groupNodeId: string, partId: string): string {
  return `${groupNodeId}__${sanitizePartId(partId)}`;
}
