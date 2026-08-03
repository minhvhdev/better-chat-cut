import type {
  MotionAnimationDefinition,
  MotionComponentDefinition,
  MotionThemeDefinition,
  MotionValidationIssue,
} from '../contracts/motion-types.ts';

const components = new Map<string, MotionComponentDefinition>();
const animations = new Map<string, MotionAnimationDefinition>();
const themes = new Map<string, MotionThemeDefinition>();

function key(assetId: string, version: string): string {
  return `${assetId}@${version}`;
}

export function registerMotionComponent(definition: MotionComponentDefinition): void {
  components.set(key(definition.assetId, definition.assetVersion), definition);
}

export function registerMotionAnimation(definition: MotionAnimationDefinition): void {
  animations.set(key(definition.assetId, definition.assetVersion), definition);
}

export function registerMotionTheme(definition: MotionThemeDefinition): void {
  themes.set(definition.id, definition);
}

export function getMotionComponent(assetId: string, version?: string): MotionComponentDefinition | undefined {
  if (version) return components.get(key(assetId, version));
  const matches = [...components.values()].filter((item) => item.assetId === assetId);
  return matches.sort((a, b) => b.assetVersion.localeCompare(a.assetVersion, undefined, { numeric: true }))[0];
}

export function getMotionAnimation(assetId: string, version?: string): MotionAnimationDefinition | undefined {
  if (version) return animations.get(key(assetId, version));
  const matches = [...animations.values()].filter((item) => item.assetId === assetId);
  return matches.sort((a, b) => b.assetVersion.localeCompare(a.assetVersion, undefined, { numeric: true }))[0];
}

export function getMotionTheme(id: string): MotionThemeDefinition | undefined {
  return themes.get(id);
}

export function listMotionComponents(): MotionComponentDefinition[] {
  return [...components.values()].sort((a, b) => a.assetId.localeCompare(b.assetId));
}

export function listMotionAnimations(): MotionAnimationDefinition[] {
  return [...animations.values()].sort((a, b) => a.assetId.localeCompare(b.assetId));
}

export function listMotionThemes(): MotionThemeDefinition[] {
  return [...themes.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function computeRuntimeRevision(): string {
  const payload = [
    ...listMotionComponents().map((item) => `${item.assetId}@${item.assetVersion}`),
    ...listMotionAnimations().map((item) => `${item.assetId}@${item.assetVersion}`),
    ...listMotionThemes().map((item) => item.id),
  ].join('\n');
  let hash = 0;
  for (let i = 0; i < payload.length; i += 1) hash = ((hash << 5) - hash + payload.charCodeAt(i)) | 0;
  return `runtime-${(hash >>> 0).toString(16)}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Minimal propsSchema object validator (no external schema libs). */
export function validateMotionProps(
  schema: Record<string, unknown> | undefined,
  props: Record<string, unknown>,
  defaults: Record<string, unknown>,
): {
  valid: boolean;
  normalizedProps: Record<string, unknown>;
  appliedDefaults: string[];
  errors: MotionValidationIssue[];
  warnings: MotionValidationIssue[];
} {
  const errors: MotionValidationIssue[] = [];
  const warnings: MotionValidationIssue[] = [];
  const appliedDefaults: string[] = [];
  const normalized: Record<string, unknown> = { ...defaults, ...props };

  for (const keyName of Object.keys(defaults)) {
    if (!(keyName in props)) appliedDefaults.push(keyName);
  }

  if (!schema) {
    return { valid: true, normalizedProps: normalized, appliedDefaults, errors, warnings };
  }

  if (schema.type && schema.type !== 'object') {
    errors.push({ path: '', code: 'invalid_schema', message: 'propsSchema.type must be object' });
  }

  const properties = isPlainObject(schema.properties) ? schema.properties : {};
  for (const [propName, rawRule] of Object.entries(properties)) {
    if (!isPlainObject(rawRule)) continue;
    const value = normalized[propName];
    const expectedType = rawRule.type;
    if (value === undefined) continue;
    if (expectedType === 'number' && typeof value !== 'number') {
      errors.push({ path: propName, code: 'invalid_type', message: `${propName} must be a number` });
    }
    if (expectedType === 'string' && typeof value !== 'string') {
      errors.push({ path: propName, code: 'invalid_type', message: `${propName} must be a string` });
    }
    if (expectedType === 'boolean' && typeof value !== 'boolean') {
      errors.push({ path: propName, code: 'invalid_type', message: `${propName} must be a boolean` });
    }
    if (typeof rawRule.minimum === 'number' && typeof value === 'number' && value < rawRule.minimum) {
      errors.push({ path: propName, code: 'below_minimum', message: `${propName} must be >= ${rawRule.minimum}` });
    }
    if (typeof rawRule.maximum === 'number' && typeof value === 'number' && value > rawRule.maximum) {
      errors.push({ path: propName, code: 'above_maximum', message: `${propName} must be <= ${rawRule.maximum}` });
    }
    if (Array.isArray(rawRule.enum) && !rawRule.enum.includes(value as never)) {
      errors.push({ path: propName, code: 'invalid_enum', message: `${propName} must be one of the allowed values` });
    }
  }

  if (schema.additionalProperties === false) {
    for (const propName of Object.keys(normalized)) {
      if (!(propName in properties) && !(propName in defaults)) {
        warnings.push({ path: propName, code: 'unknown_prop', message: `Unknown prop ${propName} ignored for strict schemas` });
        delete normalized[propName];
      }
    }
  }

  return {
    valid: errors.length === 0,
    normalizedProps: normalized,
    appliedDefaults,
    errors,
    warnings,
  };
}
