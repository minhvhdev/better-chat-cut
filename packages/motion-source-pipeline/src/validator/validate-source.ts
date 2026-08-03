import ts from 'typescript';
import { ALLOWED_IMPORTS, BLOCKED_JSX_TAGS, MAX_SOURCE_BYTES } from '../constants.ts';
import { computeSourceHash } from '../hashes.ts';
import type { MotionSourceValidationIssue, MotionSourceValidationResult } from '../contracts/types.ts';

const BLOCKED_IDENTIFIERS = new Set([
  'process', 'global', 'globalThis', 'Buffer', 'require', 'module', 'exports',
  '__dirname', '__filename', 'fetch', 'WebSocket', 'XMLHttpRequest', 'EventSource',
  'navigator', 'location', 'localStorage', 'sessionStorage', 'indexedDB', 'caches',
  'document', 'window', 'eval', 'Function', 'AsyncFunction', 'WebAssembly',
  'setTimeout', 'setInterval', 'setImmediate', 'requestAnimationFrame', 'queueMicrotask',
  'Date', 'performance', 'crypto', 'SharedArrayBuffer', 'Atomics', 'Worker',
  'SharedWorker', 'importScripts', 'postMessage',
]);

const BLOCKED_MEMBER_ROOTS = new Set([
  'Math', 'crypto', 'performance', 'Date',
]);

function pos(sourceFile: ts.SourceFile, node: ts.Node): { line?: number; column?: number } {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: line + 1, column: character + 1 };
}

function issue(
  code: string,
  message: string,
  sourceFile: ts.SourceFile,
  node: ts.Node,
  recovery?: string,
): MotionSourceValidationIssue {
  return {
    severity: 'error',
    code,
    message,
    file: 'index.tsx',
    ...pos(sourceFile, node),
    recovery,
  };
}

export type ValidateMotionSourceInput = {
  source: string;
  exportName: string;
  manifestContentHash: string;
};

export function validateMotionSource(input: ValidateMotionSourceInput): MotionSourceValidationResult {
  const errors: MotionSourceValidationIssue[] = [];
  const warnings: MotionSourceValidationIssue[] = [];
  const imports: string[] = [];
  const sourceHash = computeSourceHash(input.source);
  const byteLength = Buffer.byteLength(input.source, 'utf8');

  if (byteLength > MAX_SOURCE_BYTES) {
    errors.push({
      severity: 'error',
      code: 'MOTION_SOURCE_TOO_LARGE',
      message: `Source exceeds ${MAX_SOURCE_BYTES} bytes`,
      file: 'index.tsx',
      recovery: 'Reduce source size under 128KiB.',
    });
    return {
      valid: false,
      sourceHash,
      manifestContentHash: input.manifestContentHash,
      imports,
      errors,
      warnings,
      buildable: false,
    };
  }

  const sourceFile = ts.createSourceFile(
    'index.tsx',
    input.source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TSX,
  );

  // Surface lexer/parser issues via a lightweight transpile diagnostics pass.
  const transpile = ts.transpileModule(input.source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.React,
    },
    reportDiagnostics: true,
    fileName: 'index.tsx',
  });
  for (const diag of transpile.diagnostics ?? []) {
    const start = diag.start ?? 0;
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(Math.min(start, Math.max(0, input.source.length - 1)));
    errors.push({
      severity: 'error',
      code: 'MOTION_SOURCE_PARSE_FAILED',
      message: ts.flattenDiagnosticMessageText(diag.messageText, '\n'),
      file: 'index.tsx',
      line: line + 1,
      column: character + 1,
    });
  }

  let exportNameFound: string | undefined;
  let defineMotionCallCount = 0;

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const spec = node.moduleSpecifier;
      if (!ts.isStringLiteral(spec)) {
        errors.push(issue('MOTION_SOURCE_IMPORT_BLOCKED', 'Import specifier must be a string literal', sourceFile, node));
      } else {
        const mod = spec.text;
        imports.push(mod);
        if (!(ALLOWED_IMPORTS as readonly string[]).includes(mod)) {
          errors.push(issue(
            'MOTION_SOURCE_IMPORT_BLOCKED',
            `Import "${mod}" is not allowed`,
            sourceFile,
            node,
            'Only import from @better-chat-cut/motion-sdk.',
          ));
        }
        if (mod.startsWith('.') || mod.startsWith('/') || mod.includes(':')) {
          errors.push(issue('MOTION_SOURCE_IMPORT_BLOCKED', `Path/URL import "${mod}" is blocked`, sourceFile, node));
        }
      }
      if (node.assertClause) {
        errors.push(issue('MOTION_SOURCE_IMPORT_BLOCKED', 'Import assertions are blocked', sourceFile, node));
      }
    }

    if (ts.isImportEqualsDeclaration(node) || ts.isExportAssignment(node)) {
      errors.push(issue('MOTION_SOURCE_SYNTAX_BLOCKED', 'Unsupported import/export form', sourceFile, node));
    }

    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (expr.kind === ts.SyntaxKind.ImportKeyword) {
        errors.push(issue('MOTION_SOURCE_IMPORT_BLOCKED', 'Dynamic import() is blocked', sourceFile, node));
      }
      if (ts.isIdentifier(expr) && expr.text === 'require') {
        errors.push(issue('MOTION_SOURCE_IMPORT_BLOCKED', 'require() is blocked', sourceFile, node));
      }
      if (ts.isIdentifier(expr) && expr.text === 'eval') {
        errors.push(issue('MOTION_SOURCE_GLOBAL_BLOCKED', 'eval() is blocked', sourceFile, node));
      }
      if (
        ts.isPropertyAccessExpression(expr)
        && ts.isIdentifier(expr.expression)
        && expr.expression.text === 'Math'
        && expr.name.text === 'random'
      ) {
        errors.push(issue('MOTION_SOURCE_NON_DETERMINISTIC', 'Math.random() is blocked', sourceFile, node));
      }
      if (
        ts.isPropertyAccessExpression(expr)
        && ts.isIdentifier(expr.expression)
        && ((expr.expression.text === 'Date' && expr.name.text === 'now')
          || (expr.expression.text === 'performance' && expr.name.text === 'now')
          || (expr.expression.text === 'crypto' && (expr.name.text === 'getRandomValues' || expr.name.text === 'randomUUID')))
      ) {
        errors.push(issue('MOTION_SOURCE_NON_DETERMINISTIC', `${expr.expression.text}.${expr.name.text}() is blocked`, sourceFile, node));
      }
      if (ts.isIdentifier(expr) && expr.text === 'defineMotionComponent') {
        defineMotionCallCount += 1;
      }
    }

    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Function') {
      errors.push(issue('MOTION_SOURCE_GLOBAL_BLOCKED', 'new Function() is blocked', sourceFile, node));
    }

    if (ts.isIdentifier(node) && BLOCKED_IDENTIFIERS.has(node.text)) {
      // Allow type positions loosely: only flag value usages (parent not type node).
      const parent = node.parent;
      const inType = parent && (
        ts.isTypeReferenceNode(parent)
        || ts.isTypeQueryNode(parent)
        || ts.isTypeAliasDeclaration(parent)
        || ts.isInterfaceDeclaration(parent)
      );
      if (!inType) {
        // Property names / import bindings of blocked words still count as dangerous.
        errors.push(issue(
          'MOTION_SOURCE_GLOBAL_BLOCKED',
          `Global "${node.text}" is blocked`,
          sourceFile,
          node,
          'Use frame/fps/props/theme only for animation.',
        ));
      }
    }

    if (
      ts.isPropertyAccessExpression(node)
      && ts.isIdentifier(node.expression)
      && BLOCKED_MEMBER_ROOTS.has(node.expression.text)
      && (node.name.text === 'random' || node.name.text === 'now' || node.name.text === 'getRandomValues')
    ) {
      errors.push(issue('MOTION_SOURCE_NON_DETERMINISTIC', `${node.expression.text}.${node.name.text} is blocked`, sourceFile, node));
    }

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sourceFile);
      if (BLOCKED_JSX_TAGS.has(tag) || BLOCKED_JSX_TAGS.has(tag.toLowerCase())) {
        errors.push(issue('MOTION_SOURCE_SYNTAX_BLOCKED', `JSX tag <${tag}> is blocked`, sourceFile, node));
      }
      const attrs = ts.isJsxOpeningElement(node) ? node.attributes : node.attributes;
      for (const attr of attrs.properties) {
        if (!ts.isJsxAttribute(attr) || !attr.name || !ts.isIdentifier(attr.name)) continue;
        const name = attr.name.text;
        if (name === 'dangerouslySetInnerHTML') {
          errors.push(issue('MOTION_SOURCE_SYNTAX_BLOCKED', 'dangerouslySetInnerHTML is blocked', sourceFile, attr));
        }
        if (name.startsWith('on')) {
          errors.push(issue('MOTION_SOURCE_SYNTAX_BLOCKED', `Event handler prop "${name}" is blocked`, sourceFile, attr));
        }
        if (name === 'href' || name === 'xlinkHref') {
          const init = attr.initializer;
          if (init && ts.isStringLiteral(init)) {
            const v = init.text.trim().toLowerCase();
            if (/^(https?:|javascript:|data:|file:)/.test(v)) {
              errors.push(issue('MOTION_SOURCE_SYNTAX_BLOCKED', `External/special ${name} is blocked`, sourceFile, attr));
            }
          }
        }
      }
    }

    if (ts.isWhileStatement(node)) {
      if (node.expression.kind === ts.SyntaxKind.TrueKeyword) {
        errors.push(issue('MOTION_SOURCE_SYNTAX_BLOCKED', 'while(true) is blocked', sourceFile, node));
      }
    }
    if (ts.isForStatement(node) && !node.initializer && !node.condition && !node.incrementor) {
      errors.push(issue('MOTION_SOURCE_SYNTAX_BLOCKED', 'for(;;) is blocked', sourceFile, node));
    }

    if (ts.isAwaitExpression(node) && node.parent && ts.isSourceFile(node.parent.parent ?? ({} as ts.Node))) {
      errors.push(issue('MOTION_SOURCE_SYNTAX_BLOCKED', 'Top-level await is blocked', sourceFile, node));
    }
    if (ts.isExpressionStatement(node) && ts.isAwaitExpression(node.expression) && node.parent === sourceFile) {
      errors.push(issue('MOTION_SOURCE_SYNTAX_BLOCKED', 'Top-level await is blocked', sourceFile, node));
    }

    if (ts.isExportDeclaration(node) && node.isTypeOnly) {
      // ok
    }

    if (ts.isVariableStatement(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          exportNameFound = decl.name.text;
        }
      }
    }
    if (ts.isFunctionDeclaration(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) && node.name) {
      exportNameFound = node.name.text;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  // Detect top-level await more reliably
  for (const stmt of sourceFile.statements) {
    if (ts.isExpressionStatement(stmt) && ts.isAwaitExpression(stmt.expression)) {
      errors.push(issue('MOTION_SOURCE_SYNTAX_BLOCKED', 'Top-level await is blocked', sourceFile, stmt));
    }
  }

  if (!exportNameFound) {
    errors.push({
      severity: 'error',
      code: 'MOTION_SOURCE_EXPORT_NOT_FOUND',
      message: 'Expected a named export for the motion component',
      file: 'index.tsx',
      recovery: `Export const ${input.exportName} = defineMotionComponent(...)`,
    });
  } else if (exportNameFound !== input.exportName) {
    errors.push({
      severity: 'error',
      code: 'MOTION_SOURCE_EXPORT_MISMATCH',
      message: `Export "${exportNameFound}" does not match manifest exportName "${input.exportName}"`,
      file: 'index.tsx',
      recovery: `Rename the export to ${input.exportName}.`,
    });
  }

  if (defineMotionCallCount === 0) {
    errors.push({
      severity: 'error',
      code: 'MOTION_SOURCE_EXPORT_NOT_FOUND',
      message: 'Expected defineMotionComponent(...) entry',
      file: 'index.tsx',
    });
  } else if (defineMotionCallCount > 1) {
    warnings.push({
      severity: 'warning',
      code: 'MOTION_SOURCE_EXPORT_MISMATCH',
      message: 'Multiple defineMotionComponent calls; only one entry is supported',
      file: 'index.tsx',
    });
  }

  // Deduplicate identical errors (identifier walks can double-count)
  const seen = new Set<string>();
  const deduped = errors.filter((item) => {
    const key = `${item.code}:${item.line}:${item.column}:${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const valid = deduped.length === 0;
  return {
    valid,
    sourceHash,
    manifestContentHash: input.manifestContentHash,
    exportName: exportNameFound,
    imports,
    errors: deduped,
    warnings,
    buildable: valid,
  };
}
