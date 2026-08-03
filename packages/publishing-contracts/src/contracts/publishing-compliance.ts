export type PublishingComplianceV1 = {
  schemaVersion: '1.0.0';
  audience: 'made-for-kids' | 'not-made-for-kids';
  syntheticMedia: 'none' | 'contains-altered-or-synthetic-content';
  paidPromotion: boolean;
  rights: {
    videoRightsConfirmed: boolean;
    audioRightsConfirmed: boolean;
    thumbnailRightsConfirmed: boolean;
    subtitleRightsConfirmed: boolean;
  };
  review: {
    metadataReviewed: boolean;
    captionsReviewed: boolean;
    thumbnailReviewed: boolean;
    qaReviewed: boolean;
  };
  notes?: string;
};
