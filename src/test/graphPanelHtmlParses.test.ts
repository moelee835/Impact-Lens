import assert from 'node:assert/strict';
import Module from 'node:module';
import * as path from 'node:path';
import test from 'node:test';

// docs/work/task-fix-graphpanel-webview-syntax-error.md. graphPanel.test.ts's own comment records why
// this repository's test suite never actually EXECUTED getHtml(): "graphPanel.ts does `import * as
// vscode from 'vscode'` at its top - nothing in it, including toPayload()/getHtml(), can be required()
// from a plain node test." That was true for the whole module, but not because getHtml() itself needs
// vscode - it only reads `webview.cspSource`, a plain property. The `require('vscode')` at the top of the
// compiled module is what actually throws outside a real extension host, and it throws at MODULE LOAD
// time regardless of which export is used. This file works around exactly that one line, for this file's
// require chain only, so getHtml() can be called for real and its <script> output can be parsed for real -
// this is NOT a general "vscode is now testable" claim; nothing here exercises any real vscode API
// behavior, only a stub that lets the module load without throwing.
//
// What this test proves and what it does not: it proves the generated <script> text is syntactically
// valid JavaScript - the exact property that was violated for three releases (v0.7.0-v0.9.0, see the work
// doc) while every existing graphPanel.test.ts check (source-text regex assertions) stayed green. It does
// NOT prove the script behaves correctly in a real browser/webview, does not prove the graph actually
// renders, and does not replace a real extension-host harness (which this repository still does not
// have) - "parses" and "renders what the user expects" are different claims.
type ModuleLoad = (request: string, parent: unknown, isMain: boolean) => unknown;
const moduleWithLoad = Module as unknown as { _load: ModuleLoad };
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function patchedLoad(request, parent, isMain) {
  if (request === 'vscode') {
    return {};
  }
  return originalLoad.call(moduleWithLoad, request, parent, isMain);
};

const { getHtml } = require(path.resolve(__dirname, '..', 'graphPanel')) as {
  getHtml: (webview: { cspSource: string }, payload: unknown) => string;
};

const webviewStub = { cspSource: 'vscode-webview://stub' };

function basePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    rootId: 'root1',
    rootName: 'render_template',
    state: { label: 'Ready', className: 'ready' },
    provider: {
      host: 'lsp',
      name: 'pylance',
      version: '2026.3.102',
      selectedBy: 'bundled',
      languageMatch: true,
      requestedLanguageId: 'python',
      detectedLanguageId: 'python',
      callHierarchy: true,
      diagnostics: true,
      advertised: { callHierarchy: true, diagnostics: true },
      observed: { prepareCallHierarchy: true, incomingCalls: true, diagnostics: true },
      lifecycle: { stage: 'query', status: 'ready' },
    },
    coverage: {
      traversal: { status: 'complete', requestedDepth: 5, reachedDepth: 5, maxNodes: 50 },
      semantic: { status: 'static-only', evidenceSources: [] },
      indexing: { status: 'ready' },
      reasons: [],
    },
    completeness: {
      outcome: 'ok',
      severity: 'info',
      headline: 'Complete',
      action: '',
      bounded: true,
      callerCount: 1,
      segments: [],
      providerLabel: 'Pylance',
    },
    detailLevel: 'summary',
    changedAt: null,
    canGoBack: false,
    delta: null,
    nodes: [
      {
        id: 'root1',
        name: 'render_template',
        note: null,
        noteSource: null,
        depth: 0,
        relation: 'root',
        path: 'app/modules/mail_automation/templates.py',
        line: 12,
        changed: false,
        reviewed: false,
        testFreshness: null,
        diagnostics: [],
      },
    ],
    edges: [],
    augmentedEdges: [],
    limitations: [],
    ...overrides,
  };
}

function withDiagnostic(message: string): Record<string, unknown> {
  const base = basePayload();
  const node = (base.nodes as Array<Record<string, unknown>>)[0];
  return {
    ...base,
    nodes: [{ ...node, diagnostics: [{ message, severity: 'error' }] }],
  };
}

function extractScriptBody(html: string): string {
  const openTagEnd = html.indexOf('>', html.indexOf('<script'));
  const closeTagStart = html.lastIndexOf('</script>');
  assert.ok(openTagEnd >= 0 && closeTagStart > openTagEnd, 'expected exactly one <script>...</script> block in the generated HTML');
  return html.slice(openTagEnd + 1, closeTagStart);
}

function assertScriptParses(payload: Record<string, unknown>, label: string): void {
  const html = getHtml(webviewStub, payload);
  const scriptBody = extractScriptBody(html);
  try {
    new Function(scriptBody);
  } catch (error) {
    throw new Error(`[${label}] getHtml()'s <script> content failed to parse: ${(error as Error).message}`);
  }
}

test('getHtml() produces a parseable <script> for a minimal/empty payload', () => {
  assertScriptParses(basePayload(), 'minimal');
});

test('getHtml() produces a parseable <script> when completeness.action is set (the exact field the original defect embedded)', () => {
  const base = basePayload();
  assertScriptParses(
    { ...base, completeness: { ...(base.completeness as object), action: 'Re-run after the provider finishes indexing.' } },
    'completeness.action set',
  );
});

test('getHtml() produces a parseable <script> with a long diagnostics message', () => {
  const longMessage = 'A'.repeat(2000) + ' multi-line diagnostic text describing an incompatible type assignment in great detail.';
  assertScriptParses(withDiagnostic(longMessage), 'long diagnostics');
});

test('getHtml() produces a parseable <script> with augmentedEdges present', () => {
  assertScriptParses(
    basePayload({
      augmentedEdges: [
        {
          source: { kind: 'synthetic', name: 'read_items', kindLabel: 'function', file: 'caller.py', range: { start: { line: 5, column: 5 }, end: { line: 5, column: 15 } } },
          target: { kind: 'existing', id: 'root1' },
          adapterId: 'fastapi-static-v1',
          evidenceSource: 'static-inference',
          resolution: 'single',
          reasonCode: 'fastapi-depends',
          evidenceRanges: [{ start: { line: 5, column: 27 }, end: { line: 5, column: 33 } }],
        },
      ],
    }),
    'augmentedEdges present',
  );
});

test('getHtml() produces a parseable <script> with augmentedEdges absent (default/empty)', () => {
  assertScriptParses(basePayload({ augmentedEdges: [] }), 'augmentedEdges absent');
});

test('getHtml() produces a parseable <script> when diagnostic text contains a literal </script> sequence', () => {
  assertScriptParses(
    withDiagnostic('Template contains </script><script>alert(1)</script> which is invalid here'),
    'literal </script> in diagnostic text',
  );
});

test('getHtml() produces a parseable <script> when diagnostic text contains backticks and template-literal-looking syntax', () => {
  assertScriptParses(
    withDiagnostic('f-string `${user_input}` is not a valid Jinja expression'),
    'backtick/${} in diagnostic text',
  );
});

test('getHtml() produces a parseable <script> when diagnostic text contains U+2028 (LINE SEPARATOR)', () => {
  assertScriptParses(withDiagnostic('Line one Line two'), 'U+2028');
});

test('getHtml() produces a parseable <script> when diagnostic text contains U+2029 (PARAGRAPH SEPARATOR)', () => {
  assertScriptParses(withDiagnostic('Para one Para two'), 'U+2029');
});

test('getHtml() produces a parseable <script> for a WSL-shaped relative path', () => {
  const base = basePayload();
  const node = (base.nodes as Array<Record<string, unknown>>)[0];
  assertScriptParses(
    { ...base, nodes: [{ ...node, path: '\\\\wsl.localhost\\Ubuntu-22.04\\home\\user\\project\\app\\modules\\mail_automation\\templates.py' }] },
    'WSL-shaped path',
  );
});
