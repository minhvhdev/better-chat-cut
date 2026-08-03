export type FactualClaimV1 = {
  id: string;
  text: string;
  sourceIds: string[];
  confidence: 'high' | 'medium' | 'low';
  type: 'fact' | 'estimate' | 'interpretation' | 'opinion';
  reviewStatus: 'unreviewed' | 'accepted' | 'rejected';
  caveat?: string;
};

export const CLAIM_TYPES = ['fact', 'estimate', 'interpretation', 'opinion'] as const;
export const CLAIM_CONFIDENCE = ['high', 'medium', 'low'] as const;
export const CLAIM_REVIEW_STATUS = ['unreviewed', 'accepted', 'rejected'] as const;
