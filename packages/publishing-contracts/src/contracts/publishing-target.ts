export const CONNECTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export type PublishingTargetV1 = {
  platform: 'youtube';
  connectionId: string;
  expectedChannelId?: string;
};

export type PublishingPlatformCapabilitiesV1 = {
  platform: 'youtube';
  metadata: {
    maximumTitleLength: number;
    maximumDescriptionLength: number;
    maximumTagCount?: number;
    maximumCombinedTagLength?: number;
  };
  thumbnail: {
    acceptedMimeTypes: string[];
    requiredWidth?: number;
    requiredHeight?: number;
    maximumByteLength?: number;
  };
  subtitles: {
    supported: boolean;
    acceptedFormats: ('srt' | 'vtt')[];
  };
  upload: {
    resumable: boolean;
    supportsCancellation: boolean;
    supportsProgress: boolean;
  };
  release: {
    visibility: ('private' | 'unlisted' | 'public')[];
    scheduling: boolean;
  };
  complianceFields: string[];
};

export const DEFAULT_YOUTUBE_CAPABILITIES: PublishingPlatformCapabilitiesV1 = {
  platform: 'youtube',
  metadata: {
    maximumTitleLength: 100,
    maximumDescriptionLength: 5000,
    maximumTagCount: 500,
    maximumCombinedTagLength: 500,
  },
  thumbnail: {
    acceptedMimeTypes: ['image/png', 'image/jpeg'],
    requiredWidth: 1280,
    requiredHeight: 720,
    maximumByteLength: 2_000_000,
  },
  subtitles: {
    supported: true,
    acceptedFormats: ['srt', 'vtt'],
  },
  upload: {
    resumable: true,
    supportsCancellation: true,
    supportsProgress: true,
  },
  release: {
    visibility: ['private', 'unlisted', 'public'],
    scheduling: true,
  },
  complianceFields: [
    'audience',
    'syntheticMedia',
    'paidPromotion',
    'rights.videoRightsConfirmed',
    'rights.audioRightsConfirmed',
    'rights.thumbnailRightsConfirmed',
    'rights.subtitleRightsConfirmed',
  ],
};
