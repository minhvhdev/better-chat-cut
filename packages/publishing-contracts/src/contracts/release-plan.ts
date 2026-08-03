export type ReleasePlanV1 = {
  schemaVersion: '1.0.0';
  desiredVisibility: 'private' | 'unlisted' | 'public';
  mode: 'manual' | 'immediate' | 'scheduled';
  scheduledAt?: string;
  notifySubscribers?: boolean;
  playlistIds?: string[];
};
