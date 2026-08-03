import { ASSET_ID_PATTERN, SEMVER_PATTERN } from './asset-errors.ts';
import {
  isSafeRelativePath,
  uniqueAliases,
  uniqueNormalizedSlugs,
} from './asset-normalization.ts';
import {
  ASSET_IMPLEMENTATION_TYPES,
  ASSET_KINDS,
  ASSET_PREVIEW_TYPES,
  ASSET_PROVENANCE_ORIGINS,
  ASSET_SCHEMA_VERSION,
  ASSET_STATUSES,
  type AssetImplementationType,
  type AssetKind,
  type AssetManifestV1,
  type AssetPreviewType,
  type AssetProvenanceOrigin,
  type AssetStatus,
  type AssetValidationIssue,
  type AssetValidationResult,
} from './asset-types.ts';

function issue(path: string, code: string, message: string): AssetValidationIssue {
  return { path, code, message };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  errors: AssetValidationIssue[],
): T | undefined {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    errors.push(issue(path, 'invalid_enum', `${path} must be one of: ${allowed.join(', ')}`));
    return undefined;
  }
  return value as T;
}

function asStringArray(
  value: unknown,
  path: string,
  errors: AssetValidationIssue[],
  required: boolean,
): unknown[] | undefined {
  if (value === undefined || value === null) {
    if (required) errors.push(issue(path, 'required', `${path} is required`));
    return undefined;
  }
  if (!Array.isArray(value)) {
    errors.push(issue(path, 'invalid_type', `${path} must be an array`));
    return undefined;
  }
  for (let i = 0; i < value.length; i += 1) {
    if (typeof value[i] !== 'string') {
      errors.push(issue(`${path}[${i}]`, 'invalid_type', `${path}[${i}] must be a string`));
    }
  }
  return value;
}

export function validateAssetManifest(raw: unknown): AssetValidationResult {
  const errors: AssetValidationIssue[] = [];
  const warnings: AssetValidationIssue[] = [];

  if (!isPlainObject(raw)) {
    return {
      success: false,
      errors: [issue('', 'invalid_type', 'Manifest root must be a JSON object')],
      warnings,
    };
  }

  if (raw.schemaVersion !== ASSET_SCHEMA_VERSION) {
    errors.push(issue(
      'schemaVersion',
      'unsupported_schema_version',
      `schemaVersion must be "${ASSET_SCHEMA_VERSION}"`,
    ));
  }

  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) errors.push(issue('id', 'required', 'id is required'));
  else if (!ASSET_ID_PATTERN.test(id)) {
    errors.push(issue('id', 'invalid_id', 'id must match lowercase namespaced pattern a-z0-9 with . or -'));
  }

  const version = typeof raw.version === 'string' ? raw.version.trim() : '';
  if (!version) errors.push(issue('version', 'required', 'version is required'));
  else if (!SEMVER_PATTERN.test(version)) {
    errors.push(issue('version', 'invalid_semver', 'version must be major.minor.patch semver'));
  }

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) errors.push(issue('name', 'required', 'name is required'));

  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  if (!description) errors.push(issue('description', 'required', 'description is required'));

  const kind = asEnum(raw.kind, ASSET_KINDS, 'kind', errors) as AssetKind | undefined;
  const status = asEnum(raw.status, ASSET_STATUSES, 'status', errors) as AssetStatus | undefined;

  const categoriesRaw = asStringArray(raw.categories, 'categories', errors, true) ?? [];
  const tagsRaw = asStringArray(raw.tags, 'tags', errors, true) ?? [];
  const capabilitiesRaw = asStringArray(raw.capabilities, 'capabilities', errors, true) ?? [];
  const aliasesRaw = asStringArray(raw.aliases, 'aliases', errors, false);
  const styleTagsRaw = asStringArray(raw.styleTags, 'styleTags', errors, false);

  if (!isPlainObject(raw.implementation)) {
    errors.push(issue('implementation', 'required', 'implementation is required object'));
  }

  let implementationType: AssetImplementationType | undefined;
  let entry = '';
  let exportName: string | undefined;
  if (isPlainObject(raw.implementation)) {
    implementationType = asEnum(
      raw.implementation.type,
      ASSET_IMPLEMENTATION_TYPES,
      'implementation.type',
      errors,
    );
    entry = typeof raw.implementation.entry === 'string' ? raw.implementation.entry : '';
    if (!entry) errors.push(issue('implementation.entry', 'required', 'implementation.entry is required'));
    else if (!isSafeRelativePath(entry)) {
      errors.push(issue(
        'implementation.entry',
        'unsafe_path',
        'implementation.entry must be a relative path without traversal',
      ));
    }
    if (raw.implementation.exportName !== undefined) {
      if (typeof raw.implementation.exportName !== 'string' || !raw.implementation.exportName.trim()) {
        errors.push(issue('implementation.exportName', 'invalid_type', 'exportName must be a non-empty string'));
      } else {
        exportName = raw.implementation.exportName.trim();
      }
    }
  }

  if (raw.propsSchema !== undefined) {
    if (!isPlainObject(raw.propsSchema)) {
      errors.push(issue('propsSchema', 'invalid_type', 'propsSchema must be a JSON object when present'));
    }
  }

  const previews: AssetManifestV1['previews'] = [];
  if (raw.previews !== undefined) {
    if (!Array.isArray(raw.previews)) {
      errors.push(issue('previews', 'invalid_type', 'previews must be an array'));
    } else {
      raw.previews.forEach((preview, index) => {
        const p = `previews[${index}]`;
        if (!isPlainObject(preview)) {
          errors.push(issue(p, 'invalid_type', `${p} must be an object`));
          return;
        }
        const type = asEnum(preview.type, ASSET_PREVIEW_TYPES, `${p}.type`, errors) as AssetPreviewType | undefined;
        const path = typeof preview.path === 'string' ? preview.path : '';
        const mimeType = typeof preview.mimeType === 'string' ? preview.mimeType.trim() : '';
        if (!path) errors.push(issue(`${p}.path`, 'required', `${p}.path is required`));
        else if (!isSafeRelativePath(path)) {
          errors.push(issue(`${p}.path`, 'unsafe_path', `${p}.path must be a safe relative path`));
        }
        if (!mimeType) errors.push(issue(`${p}.mimeType`, 'required', `${p}.mimeType is required`));
        if (type && path && mimeType && isSafeRelativePath(path)) {
          previews.push({ type, path, mimeType });
        }
      });
    }
  }

  if (!isPlainObject(raw.license)) {
    errors.push(issue('license', 'required', 'license is required object'));
  }
  let license: AssetManifestV1['license'] | undefined;
  if (isPlainObject(raw.license)) {
    const spdx = typeof raw.license.spdx === 'string' ? raw.license.spdx.trim() : '';
    if (!spdx) errors.push(issue('license.spdx', 'required', 'license.spdx is required'));
    else {
      license = { spdx };
      if (typeof raw.license.attribution === 'string' && raw.license.attribution.trim()) {
        license.attribution = raw.license.attribution.trim();
      }
      if (typeof raw.license.sourceUrl === 'string' && raw.license.sourceUrl.trim()) {
        license.sourceUrl = raw.license.sourceUrl.trim();
      }
    }
  }

  let provenance: AssetManifestV1['provenance'] | undefined;
  if (raw.provenance !== undefined) {
    if (!isPlainObject(raw.provenance)) {
      errors.push(issue('provenance', 'invalid_type', 'provenance must be an object'));
    } else {
      const origin = asEnum(
        raw.provenance.origin,
        ASSET_PROVENANCE_ORIGINS,
        'provenance.origin',
        errors,
      ) as AssetProvenanceOrigin | undefined;
      if (origin) {
        provenance = { origin };
        if (typeof raw.provenance.sourceAssetId === 'string' && raw.provenance.sourceAssetId.trim()) {
          provenance.sourceAssetId = raw.provenance.sourceAssetId.trim();
        }
        if (typeof raw.provenance.createdBy === 'string' && raw.provenance.createdBy.trim()) {
          provenance.createdBy = raw.provenance.createdBy.trim();
        }
      }
    }
  }

  let deprecation: AssetManifestV1['deprecation'] | undefined;
  if (status === 'deprecated') {
    if (!isPlainObject(raw.deprecation)) {
      errors.push(issue('deprecation', 'required', 'deprecation.reason is required when status is deprecated'));
    } else {
      const reason = typeof raw.deprecation.reason === 'string' ? raw.deprecation.reason.trim() : '';
      if (!reason) {
        errors.push(issue('deprecation.reason', 'required', 'deprecation.reason is required when status is deprecated'));
      } else {
        deprecation = { reason };
        if (typeof raw.deprecation.replacementAssetId === 'string' && raw.deprecation.replacementAssetId.trim()) {
          deprecation.replacementAssetId = raw.deprecation.replacementAssetId.trim();
        }
      }
    }
  } else if (raw.deprecation !== undefined) {
    warnings.push(issue('deprecation', 'unexpected_deprecation', 'deprecation is ignored unless status is deprecated'));
  }

  if (errors.length > 0 || !kind || !status || !implementationType || !license || !id || !version || !name || !description) {
    return { success: false, errors, warnings };
  }

  const manifest: AssetManifestV1 = {
    schemaVersion: ASSET_SCHEMA_VERSION,
    id,
    version,
    name,
    description,
    kind,
    status,
    categories: uniqueNormalizedSlugs(categoriesRaw),
    tags: uniqueNormalizedSlugs(tagsRaw),
    capabilities: uniqueNormalizedSlugs(capabilitiesRaw),
    implementation: {
      type: implementationType,
      entry,
      ...(exportName ? { exportName } : {}),
    },
    license,
  };

  if (aliasesRaw) manifest.aliases = uniqueAliases(aliasesRaw);
  if (styleTagsRaw) manifest.styleTags = uniqueNormalizedSlugs(styleTagsRaw);
  if (isPlainObject(raw.propsSchema)) manifest.propsSchema = raw.propsSchema;
  if (previews.length) manifest.previews = previews;
  if (provenance) manifest.provenance = provenance;
  if (deprecation) manifest.deprecation = deprecation;

  return { success: true, manifest, warnings };
}
