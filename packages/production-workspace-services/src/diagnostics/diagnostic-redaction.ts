const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|oauth|authorization)\s*[:=]\s*['"]?([^\s'"]+)/gi,
  /(?:sk|pk|rk|tok)[-_][A-Za-z0-9]{16,}/g,
  /(?:ya29\.|xox[baprs]-|ghp_|gho_|github_pat_)[A-Za-z0-9_\-.]+/g,
  /[?&](?:token|key|secret|access_token|api_key)=[^&\s]+/gi,
  /MCP[_-]?TOKEN[=:]\s*\S+/gi,
  /[a-f0-9]{32,}UploadId[^\s]*/gi,
];

const PATH_PATTERNS: RegExp[] = [
  /[A-Za-z]:\\Users\\[^\\\s]+/gi,
  /[A-Za-z]:\\[^\\\s]+(?:\\[^\\\s]+)+/g,
  /\/(?:Users|home)\/[^/\s]+(?:\/[^\s]*)?/g,
  /~\/[^\s]+/g,
];

const MAX_FIELD = 400;

export function redactString(value: string): string {
  let out = value;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, '[REDACTED_SECRET]');
  }
  for (const re of PATH_PATTERNS) {
    out = out.replace(re, '[REDACTED_PATH]');
  }
  if (out.length > MAX_FIELD) {
    out = `${out.slice(0, MAX_FIELD)}…[truncated]`;
  }
  return out;
}

export function redactDiagnosticValue<T>(value: T, depth = 0): T {
  if (value == null || depth > 8) return value;
  if (typeof value === 'string') return redactString(value) as T;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactDiagnosticValue(item, depth + 1)) as T;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(obj)) {
      const lower = key.toLowerCase();
      if (
        lower.includes('token')
        || lower.includes('secret')
        || lower.includes('password')
        || lower.includes('authorization')
        || lower === 'apikey'
        || lower === 'api_key'
        || lower.endsWith('path')
        || lower.includes('filepath')
        || lower.includes('localpath')
      ) {
        next[key] = '[REDACTED]';
        continue;
      }
      next[key] = redactDiagnosticValue(v, depth + 1);
    }
    return next as T;
  }
  return value;
}
