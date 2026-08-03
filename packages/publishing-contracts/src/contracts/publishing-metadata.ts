import type { PublishingChapterV1 } from './publishing-chapter.ts';

/** YouTube-specific overrides currently mapped by the adapter. */
export type YouTubePublishingMetadataV1 = {
  categoryId?: string;
  defaultLanguage?: string;
  defaultAudioLanguage?: string;
  madeForKids?: boolean;
  selfDeclaredMadeForKids?: boolean;
};

export type PublishingMetadataV1 = {
  schemaVersion: '1.0.0';
  title: string;
  description: string;
  language: string;
  tags: string[];
  category?: string;
  chapters?: PublishingChapterV1[];
  credits?: {
    label: string;
    value: string;
    url?: string;
  }[];
  sourceAttributions?: {
    sourceId: string;
    title: string;
    publisher?: string;
    url?: string;
  }[];
  callToAction?: string;
  targetOverrides?: {
    youtube?: YouTubePublishingMetadataV1;
  };
};

export const PUBLISHING_METADATA_LIMITS = {
  MAX_TITLE_LENGTH: 200,
  MAX_DESCRIPTION_LENGTH: 10_000,
  MAX_TAG_COUNT: 500,
  MAX_TAG_LENGTH: 100,
  MAX_CHAPTERS: 100,
  MAX_CREDITS: 50,
  MAX_ATTRIBUTIONS: 100,
  MAX_SERIALIZED_BYTES: 256_000,
} as const;
