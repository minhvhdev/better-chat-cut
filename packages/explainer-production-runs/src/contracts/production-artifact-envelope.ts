import type { ProductionArtifactType, ProductionStageId } from '../../../explainer-production-contracts/src/index.ts';

export type ProductionArtifactEnvelopeV1<T = unknown> = {
  schemaVersion: '1.0.0';
  artifactType: ProductionArtifactType;
  artifactSchemaVersion: string;
  artifactHash: string;
  producer: {
    stageId: ProductionStageId;
    operationId?: string;
    adapterRevision: string;
  };
  inputs: {
    artifactType: ProductionArtifactType;
    artifactHash: string;
  }[];
  content: T;
  createdAt: string;
};

export type ProductionArtifactLineageV1 = {
  artifactType: ProductionArtifactType;
  artifactHash: string;
  inputs: {
    artifactType: ProductionArtifactType;
    artifactHash: string;
  }[];
  downstream: {
    artifactType: ProductionArtifactType;
    artifactHash: string;
  }[];
};
