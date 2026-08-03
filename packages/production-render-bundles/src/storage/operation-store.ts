import { existsSync, appendFileSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveDeliveryRoot } from './delivery-root.ts';
import { bundleDir, operationDir, assertPathInsideRoot } from './delivery-paths.ts';
import { atomicWriteJson, ensureDir } from './atomic-finalize.ts';
import { sha256File, computeDeliveryManifestHash } from './artifact-hash.ts';
import type {
  DeliveryBundleManifestV1,
  ProductionRenderEventV1,
  ProductionRenderOperationV1,
  ProductionRenderReceiptV1,
} from '../contracts/render-operation.ts';

export type DeliveryStoreOptions = {
  deliveryRoot?: string;
  now?: () => string;
  createOperationId?: () => string;
};

export class DeliveryStore {
  readonly root: string;
  private readonly now: () => string;
  private readonly createOperationId: () => string;

  constructor(options: DeliveryStoreOptions = {}) {
    this.root = resolveDeliveryRoot(options.deliveryRoot);
    this.now = options.now ?? (() => new Date().toISOString());
    this.createOperationId = options.createOperationId ?? (() => `op_${randomUUID().replace(/-/g, '').slice(0, 16)}`);
    ensureDir(join(this.root, 'operations'));
    ensureDir(join(this.root, 'bundles'));
  }

  newOperationId(): string {
    return this.createOperationId();
  }

  operationPath(operationId: string): string {
    return join(operationDir(this.root, operationId), 'operation.json');
  }

  receiptPath(operationId: string): string {
    return join(operationDir(this.root, operationId), 'receipt.json');
  }

  eventsPath(operationId: string): string {
    return join(operationDir(this.root, operationId), 'events.jsonl');
  }

  temporaryDir(operationId: string): string {
    return join(operationDir(this.root, operationId), 'temporary');
  }

  writeOperation(operation: ProductionRenderOperationV1): void {
    const dir = operationDir(this.root, operation.operationId);
    ensureDir(dir);
    atomicWriteJson(this.operationPath(operation.operationId), operation);
  }

  readOperation(operationId: string): ProductionRenderOperationV1 | null {
    const path = this.operationPath(operationId);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8')) as ProductionRenderOperationV1;
  }

  writeReceipt(receipt: ProductionRenderReceiptV1): void {
    atomicWriteJson(this.receiptPath(receipt.operationId), receipt);
  }

  readReceipt(operationId: string): ProductionRenderReceiptV1 | null {
    const path = this.receiptPath(operationId);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8')) as ProductionRenderReceiptV1;
  }

  appendEvent(event: ProductionRenderEventV1): void {
    const path = this.eventsPath(event.operationId);
    ensureDir(operationDir(this.root, event.operationId));
    appendFileSync(path, `${JSON.stringify(event)}\n`, 'utf8');
  }

  findByRequestId(requestId: string): ProductionRenderOperationV1 | null {
    for (const op of this.listOperations({ limit: 1000, offset: 0 })) {
      if (op.requestId === requestId) return op;
    }
    return null;
  }

  listOperations(opts: { status?: string[]; limit: number; offset: number }): ProductionRenderOperationV1[] {
    const dir = join(this.root, 'operations');
    if (!existsSync(dir)) return [];
    const ids = readdirSync(dir).sort();
    const all: ProductionRenderOperationV1[] = [];
    for (const id of ids) {
      const op = this.readOperation(id);
      if (!op) continue;
      if (opts.status?.length && !opts.status.includes(op.status)) continue;
      all.push(op);
    }
    return all.slice(opts.offset, opts.offset + opts.limit);
  }

  readManifest(bundleId: string): DeliveryBundleManifestV1 | null {
    const path = join(bundleDir(this.root, bundleId), 'manifest.json');
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8')) as DeliveryBundleManifestV1;
  }

  bundleExists(bundleId: string): boolean {
    return existsSync(join(bundleDir(this.root, bundleId), 'manifest.json'));
  }

  validateBundle(bundleId: string): {
    valid: boolean;
    manifestHashValid: boolean;
    artifactHashesValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    const manifest = this.readManifest(bundleId);
    if (!manifest) {
      return { valid: false, manifestHashValid: false, artifactHashesValid: false, errors: ['manifest missing'] };
    }
    const dir = bundleDir(this.root, bundleId);
    let artifactHashesValid = true;
    for (const artifact of manifest.artifacts) {
      const file = join(dir, artifact.fileName);
      assertPathInsideRoot(this.root, file);
      if (!existsSync(file)) {
        artifactHashesValid = false;
        errors.push(`missing ${artifact.fileName}`);
        continue;
      }
      if (artifact.role === 'manifest') continue;
      const hash = sha256File(file);
      if (hash !== artifact.sha256) {
        artifactHashesValid = false;
        errors.push(`hash mismatch ${artifact.fileName}`);
      }
    }
    const { manifestHash: _mh, createdAt: _ca, ...without } = manifest;
    const forHash = {
      ...without,
      artifacts: without.artifacts.map((a) => (
        a.role === 'manifest' ? { ...a, byteLength: 0, sha256: '' } : a
      )),
    };
    const expected = computeDeliveryManifestHash(forHash);
    const manifestHashValid = expected === manifest.manifestHash;
    if (!manifestHashValid) errors.push('manifest hash invalid');
    return {
      valid: errors.length === 0,
      manifestHashValid,
      artifactHashesValid,
      errors,
    };
  }

  cleanupTemporary(operationId: string): void {
    const dir = this.temporaryDir(operationId);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }

  timestamp(): string {
    return this.now();
  }
}

export function createDeliveryStore(options?: DeliveryStoreOptions): DeliveryStore {
  return new DeliveryStore(options);
}
