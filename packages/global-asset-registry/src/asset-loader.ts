import { createHash } from 'node:crypto';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { compareSemverDesc } from './asset-normalization.ts';
import { validateAssetManifest } from './asset-validator.ts';
import type {
  AssetCatalogDiagnostic,
  AssetCatalogLoadResult,
  AssetManifestV1,
  LoadAssetCatalogOptions,
} from './asset-types.ts';

async function collectAssetFiles(root: string): Promise<string[]> {
  const absoluteRoot = resolve(root);
  const rootReal = await realpath(absoluteRoot).catch(() => absoluteRoot);
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      throw Object.assign(new Error(`Cannot read catalog root: ${root}`), { cause: error });
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = join(dir, entry.name);
      let targetReal: string;
      try {
        targetReal = await realpath(full);
      } catch {
        continue;
      }
      const rel = relative(rootReal, targetReal);
      if (rel.startsWith('..') || rel.startsWith(`..${sep}`)) {
        continue;
      }
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.asset.json')) {
        files.push(full);
      }
    }
  }

  const rootStat = await stat(absoluteRoot).catch(() => null);
  if (!rootStat) return files;
  if (!rootStat.isDirectory()) {
    throw new Error(`Catalog root is not a directory: ${root}`);
  }
  await walk(absoluteRoot);
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

export async function loadAssetCatalog(
  options: LoadAssetCatalogOptions,
): Promise<AssetCatalogLoadResult> {
  const diagnostics: AssetCatalogDiagnostic[] = [];
  const manifests: AssetManifestV1[] = [];
  const seen = new Map<string, string>();

  for (const root of options.roots) {
    let files: string[];
    try {
      files = await collectAssetFiles(root);
    } catch (error) {
      diagnostics.push({
        severity: 'error',
        code: 'catalog_root_unreadable',
        message: error instanceof Error ? error.message : String(error),
        file: root,
      });
      continue;
    }

    for (const file of files) {
      let text: string;
      try {
        text = await readFile(file, 'utf8');
      } catch (error) {
        diagnostics.push({
          severity: 'error',
          code: 'manifest_unreadable',
          message: error instanceof Error ? error.message : String(error),
          file,
        });
        continue;
      }

      // Tolerate UTF-8 BOM from editors/shells on Windows.
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

      let raw: unknown;
      try {
        raw = JSON.parse(text) as unknown;
      } catch (error) {
        diagnostics.push({
          severity: 'error',
          code: 'invalid_json',
          message: error instanceof Error ? error.message : 'Invalid JSON',
          file,
        });
        continue;
      }

      const validated = validateAssetManifest(raw);
      for (const warning of validated.warnings) {
        diagnostics.push({
          severity: 'warning',
          code: warning.code,
          message: warning.message,
          file,
          path: warning.path,
        });
      }
      if (!validated.success) {
        for (const err of validated.errors) {
          diagnostics.push({
            severity: 'error',
            code: err.code,
            message: err.message,
            file,
            path: err.path,
          });
        }
        continue;
      }

      const key = `${validated.manifest.id}@${validated.manifest.version}`;
      const previous = seen.get(key);
      if (previous) {
        diagnostics.push({
          severity: 'error',
          code: 'duplicate_id_version',
          message: `Duplicate asset ${key}; already loaded from ${previous}`,
          file,
        });
        continue;
      }
      seen.set(key, file);

      if (options.verifyReferencedFiles) {
        const baseDir = resolve(file, '..');
        const refs = [
          validated.manifest.implementation.entry,
          ...(validated.manifest.previews ?? []).map((preview) => preview.path),
        ];
        for (const ref of refs) {
          const target = resolve(baseDir, ref);
          const exists = await stat(target).then(() => true).catch(() => false);
          if (!exists) {
            diagnostics.push({
              severity: 'warning',
              code: 'missing_referenced_file',
              message: `Referenced file does not exist: ${ref}`,
              file,
              path: ref,
            });
          }
        }
      }

      manifests.push(validated.manifest);
    }
  }

  manifests.sort((a, b) => {
    const byId = a.id.localeCompare(b.id);
    if (byId !== 0) return byId;
    return compareSemverDesc(a.version, b.version);
  });

  const hasErrors = diagnostics.some((item) => item.severity === 'error');
  if (options.strict && hasErrors) {
    const detail = diagnostics
      .filter((item) => item.severity === 'error')
      .map((item) => `${item.file ?? '?'}: ${item.message}`)
      .join('; ');
    throw new Error(`Strict catalog load failed: ${detail}`);
  }

  return { manifests, diagnostics };
}

export function computeCatalogRevision(manifests: AssetManifestV1[]): string {
  const normalized = [...manifests]
    .sort((a, b) => {
      const byId = a.id.localeCompare(b.id);
      if (byId !== 0) return byId;
      return compareSemverDesc(a.version, b.version);
    })
    .map((manifest) => JSON.stringify(manifest));
  return createHash('sha256').update(normalized.join('\n')).digest('hex');
}

export function resolveAssetCatalogRoots(cwd = process.cwd()): string[] {
  const override = process.env.BETTER_CHAT_CUT_ASSET_CATALOG_ROOT?.trim();
  if (override) return [resolve(cwd, override)];
  return [resolve(cwd, 'extensions', 'better-chat-cut', 'catalog', 'manifests')];
}
