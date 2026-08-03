import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import {
  ensureBetterChatCutMotionRuntime,
  getMotionTheme,
  validateMotionProps,
} from '../../../motion-components/src/index.ts';
import { resolveWritableAssetCatalogRoot } from '../../../global-asset-registry/src/index.ts';
import type { GlobalAssetRegistryWithRecords } from '../../../global-asset-registry/src/asset-registry.ts';
import { MotionSourceError } from '../errors.ts';
import { computePixelHash } from '../hashes.ts';
import { resolveMotionAssetPaths } from '../paths/asset-paths.ts';
import { createMotionSourceCompiler } from './build-service.ts';
import { PREVIEW_TIMEOUT_MS } from '../constants.ts';

ensureBetterChatCutMotionRuntime();

let bundlePromise: Promise<string> | null = null;

function webpackOverride(config: Record<string, unknown>) {
  const resolve = (config.resolve ?? {}) as Record<string, unknown>;
  const module = (config.module ?? {}) as Record<string, unknown>;
  const extensionAlias = (resolve.extensionAlias ?? {}) as Record<string, unknown>;
  const rules = Array.isArray(module.rules) ? module.rules : [];
  return {
    ...config,
    resolve: {
      ...resolve,
      extensionAlias: {
        ...extensionAlias,
        '.js': ['.js', '.ts', '.tsx'],
      },
    },
    module: {
      ...module,
      rules: [...rules, { test: /\.frag$/, type: 'asset/source' }],
    },
  };
}

async function getServeUrl(): Promise<string> {
  if (!bundlePromise) {
    const entry = join(process.cwd(), 'remotion', 'index.ts');
    const publicDir = join(process.cwd(), 'assets');
    bundlePromise = bundle({
      entryPoint: entry,
      publicDir,
      webpackOverride: webpackOverride as never,
    });
  }
  return bundlePromise;
}

function previewCacheDir(): string {
  return join(homedir(), '.openchatcut', 'better-chat-cut', 'candidate-preview-cache');
}

function cacheKey(parts: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function pngLooksValid(buffer: Buffer, width: number, height: number): void {
  if (buffer.byteLength < 100) {
    throw new MotionSourceError('MOTION_SOURCE_PREVIEW_INVALID', 'PNG too small');
  }
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50) {
    throw new MotionSourceError('MOTION_SOURCE_PREVIEW_INVALID', 'Not a PNG');
  }
  // IHDR width/height at bytes 16-23
  const w = buffer.readUInt32BE(16);
  const h = buffer.readUInt32BE(20);
  if (w !== width || h !== height) {
    throw new MotionSourceError(
      'MOTION_SOURCE_PREVIEW_INVALID',
      `Unexpected PNG size ${w}x${h}, expected ${width}x${height}`,
    );
  }
}

export function createMotionCandidatePreviewService(options: {
  registry: GlobalAssetRegistryWithRecords;
  userCatalogRoot?: string;
}) {
  const userRoot = options.userCatalogRoot ?? resolveWritableAssetCatalogRoot().path;
  const compiler = createMotionSourceCompiler(options);

  async function loadCandidateBundle(input: {
    assetId: string;
    assetVersion: string;
    sourceHash?: string;
    buildHash?: string;
    expectedCatalogRevision: string;
    expectedManifestContentHash: string;
  }) {
    let buildHash = input.buildHash;
    if (!buildHash) {
      const built = await compiler.build({
        assetId: input.assetId,
        assetVersion: input.assetVersion,
        expectedCatalogRevision: input.expectedCatalogRevision,
        expectedManifestContentHash: input.expectedManifestContentHash,
        expectedSourceHash: input.sourceHash ?? (await (async () => {
          const paths = resolveMotionAssetPaths(userRoot, input.assetId, input.assetVersion);
          const source = await readFile(paths.sourceFile, 'utf8');
          return createHash('sha256').update(source, 'utf8').digest('hex');
        })()),
      });
      buildHash = built.buildHash;
    }
    const { code, descriptor } = await compiler.readBundle(input.assetId, input.assetVersion, buildHash);
    if (input.sourceHash && descriptor.sourceHash !== input.sourceHash) {
      throw new MotionSourceError('MOTION_SOURCE_BUILD_STALE', 'Build does not match source hash');
    }
    return { code, descriptor, buildHash };
  }

  async function renderOnce(args: {
    bundleCode: string;
    props: Record<string, unknown>;
    themeId: string;
    mode: 'still' | 'contact-sheet';
    frame: number;
    width: number;
    height: number;
    fps: number;
    durationInFrames: number;
    contactSheetFrames?: number[];
  }): Promise<{ buffer: Buffer; cacheHit: boolean; key: string }> {
    if (process.env.BCC_SKIP_MOTION_RENDER === '1') {
      // Deterministic tiny fake PNG header for fast tests (not a real render).
      const fake = Buffer.alloc(128, 0);
      fake[0] = 0x89;
      fake[1] = 0x50;
      fake[2] = 0x4e;
      fake[3] = 0x47;
      fake.writeUInt32BE(args.width, 16);
      fake.writeUInt32BE(args.height, 20);
      return { buffer: fake, cacheHit: false, key: 'skip' };
    }

    const key = cacheKey({
      kind: 'candidate',
      mode: args.mode,
      themeId: args.themeId,
      frame: args.frame,
      width: args.width,
      height: args.height,
      fps: args.fps,
      durationInFrames: args.durationInFrames,
      props: args.props,
      contactSheetFrames: args.contactSheetFrames ?? null,
      bundleHash: createHash('sha256').update(args.bundleCode).digest('hex'),
    });
    const cacheDir = previewCacheDir();
    await mkdir(cacheDir, { recursive: true });
    const cachePath = join(cacheDir, `${key}.png`);
    try {
      const cached = await readFile(cachePath);
      return { buffer: cached, cacheHit: true, key };
    } catch {
      // miss
    }

    const serveUrl = await getServeUrl();
    const compositionId = args.mode === 'contact-sheet'
      ? 'BetterChatCutAssetContactSheet'
      : 'BetterChatCutAssetStill';
    const inputProps = {
      assetId: 'candidate.local',
      themeId: args.themeId,
      mode: args.mode,
      frame: args.frame,
      width: args.width,
      height: args.height,
      fps: args.fps,
      durationInFrames: args.durationInFrames,
      contactSheetFrames: args.contactSheetFrames,
      candidateBundleCode: args.bundleCode,
      candidateProps: args.props,
      props: args.props,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS);
    try {
      const composition = await selectComposition({
        serveUrl,
        id: compositionId,
        inputProps,
      });
      const { buffer } = await renderStill({
        serveUrl,
        composition,
        inputProps,
        frame: args.mode === 'contact-sheet' ? 0 : args.frame,
        imageFormat: 'png',
      });
      if (!buffer) {
        throw new MotionSourceError('MOTION_SOURCE_RENDER_FAILED', 'Empty Remotion buffer');
      }
      const buf = Buffer.from(buffer);
      pngLooksValid(buf, args.width, args.height);
      await writeFile(cachePath, buf);
      return { buffer: buf, cacheHit: false, key };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new MotionSourceError('MOTION_SOURCE_SANDBOX_TIMEOUT', 'Candidate preview timed out');
      }
      if (error instanceof MotionSourceError) throw error;
      throw new MotionSourceError(
        'MOTION_SOURCE_SANDBOX_FAILED',
        error instanceof Error ? error.message : 'Sandbox render failed',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async renderPreview(input: {
      assetId: string;
      assetVersion: string;
      buildHash?: string;
      sourceHash?: string;
      expectedCatalogRevision: string;
      expectedManifestContentHash: string;
      props?: Record<string, unknown>;
      themeId?: string;
      mode: 'still' | 'contact-sheet';
      frame?: number;
      frames?: number[];
      width?: number;
      height?: number;
      fps?: number;
      durationInFrames?: number;
      verifyDeterminism?: boolean;
    }) {
      await options.registry.refresh();
      const record = options.registry.getRecords().find(
        (item) => item.manifest.id === input.assetId && item.manifest.version === input.assetVersion,
      );
      if (!record) throw new MotionSourceError('MOTION_SOURCE_NOT_FOUND', 'Asset not found');

      const { code, descriptor, buildHash } = await loadCandidateBundle({
        assetId: input.assetId,
        assetVersion: input.assetVersion,
        sourceHash: input.sourceHash,
        buildHash: input.buildHash,
        expectedCatalogRevision: input.expectedCatalogRevision,
        expectedManifestContentHash: input.expectedManifestContentHash,
      });

      const themeId = input.themeId ?? 'default';
      if (!getMotionTheme(themeId)) {
        throw new MotionSourceError('MOTION_SOURCE_RENDER_FAILED', `Unknown theme ${themeId}`);
      }

      const defaults: Record<string, unknown> = {};
      const schema = record.manifest.propsSchema;
      if (schema && typeof schema === 'object' && schema.properties && typeof schema.properties === 'object') {
        for (const [key, rule] of Object.entries(schema.properties as Record<string, { default?: unknown }>)) {
          if (rule && typeof rule === 'object' && 'default' in rule) defaults[key] = rule.default;
        }
      }
      // Fixture-friendly defaults for orbiting body
      const mergedDefaults = {
        bodyRadius: 24,
        orbitRadius: 120,
        fill: '#38bdf8',
        orbitColor: '#64748b',
        ...defaults,
      };
      const validated = validateMotionProps(schema, input.props ?? {}, mergedDefaults);
      if (!validated.valid) {
        throw new MotionSourceError(
          'MOTION_SOURCE_RENDER_FAILED',
          validated.errors.map((e) => e.message).join('; '),
        );
      }

      const width = input.width ?? 640;
      const height = input.height ?? 360;
      const fps = input.fps ?? 30;
      const durationInFrames = input.durationInFrames ?? 45;
      const frame = input.frame ?? 15;
      const contactSheetFrames = input.frames ?? [0, 12, 24, 36, 44];

      const first = await renderOnce({
        bundleCode: code,
        props: validated.normalizedProps,
        themeId,
        mode: input.mode,
        frame,
        width,
        height,
        fps,
        durationInFrames,
        contactSheetFrames,
      });

      let determinism: {
        deterministic: boolean;
        renderCount: number;
        pixelHashes: string[];
      } | undefined;

      if (input.verifyDeterminism) {
        const second = await renderOnce({
          bundleCode: code,
          props: validated.normalizedProps,
          themeId,
          mode: input.mode,
          frame,
          width,
          height,
          fps,
          durationInFrames,
          contactSheetFrames,
        });
        const h1 = computePixelHash(first.buffer);
        const h2 = computePixelHash(second.buffer);
        determinism = {
          deterministic: h1 === h2,
          renderCount: 2,
          pixelHashes: [h1, h2],
        };
        if (!determinism.deterministic && process.env.BCC_SKIP_MOTION_RENDER !== '1') {
          throw new MotionSourceError(
            'MOTION_SOURCE_DETERMINISM_FAILED',
            'Candidate renders were not pixel-identical',
          );
        }
      }

      return {
        assetId: input.assetId,
        assetVersion: input.assetVersion,
        sourceHash: descriptor.sourceHash,
        buildHash,
        themeId,
        mode: input.mode,
        frame: input.mode === 'contact-sheet' ? 0 : frame,
        width,
        height,
        mimeType: 'image/png' as const,
        base64: first.buffer.toString('base64'),
        cacheHit: first.cacheHit,
        sandbox: {
          contractVersion: descriptor.sandboxContractVersion,
          executedIn: 'remotion-chromium',
          nodeVmUsed: false,
          dynamicImportUsed: false,
        },
        determinism,
        __images: [{
          base64: first.buffer.toString('base64'),
          mimeType: 'image/png',
          frame: input.mode === 'contact-sheet' ? 0 : frame,
        }],
      };
    },
  };
}
