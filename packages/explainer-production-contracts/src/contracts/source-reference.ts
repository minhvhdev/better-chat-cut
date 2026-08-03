export type SourceReferenceV1 = {
  id: string;
  title: string;
  publisher?: string;
  author?: string;
  url?: string;
  publicationDate?: string;
  accessedDate?: string;
  sourceType:
    | 'official'
    | 'paper'
    | 'book'
    | 'article'
    | 'dataset'
    | 'interview'
    | 'user-provided'
    | 'other';
  notes?: string;
  reliability:
    | 'primary'
    | 'authoritative-secondary'
    | 'secondary'
    | 'unverified';
};

export const SOURCE_TYPES = [
  'official',
  'paper',
  'book',
  'article',
  'dataset',
  'interview',
  'user-provided',
  'other',
] as const;

export const SOURCE_RELIABILITY = [
  'primary',
  'authoritative-secondary',
  'secondary',
  'unverified',
] as const;
