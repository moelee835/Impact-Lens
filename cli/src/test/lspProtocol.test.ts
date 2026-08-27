import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import test from 'node:test';
import { clone, lookupSection, resolveConfiguration } from '../lsp/configuration';
import { classifyIncoming } from '../lsp/protocol';
import { createServerRequestHandlers, methodNotFound } from '../lsp/serverRequests';

test('every shipped source directory is listed in the package files', () => {
  // `files` matches one path segment at a time, so `dist/*.js` silently excludes `dist/lsp/*.js`.
  // Nothing in the unit suite notices, because it runs against the checkout: the first symptom is a
  // MODULE_NOT_FOUND from an installed tarball, which is a packaging test away from where the mistake
  // was made. Adding a directory under `cli/src` therefore fails here instead.
  const root = path.resolve(__dirname, '..', '..');
  const files: string[] = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).files;
  const sourceRoot = path.join(root, 'src');
  const shipped = fs.readdirSync(sourceRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== 'test')
    .map(entry => `dist/${entry.name}/*.js`);
  const missing = shipped.filter(pattern => !files.includes(pattern));
  assert.deepEqual(missing, [], `cli/package.json files is missing: ${missing.join(', ')}`);
});

test('classifies a message by shape, not by id', () => {
  // The pair that used to be misrouted: both carry id 1, and only the presence of `method` separates
  // an inbound request from the answer to our own outbound request of the same number.
  assert.equal(classifyIncoming({ id: 1, method: 'workspace/configuration', params: {} }), 'request');
  assert.equal(classifyIncoming({ id: 1, result: { capabilities: {} } }), 'response');
  assert.equal(classifyIncoming({ method: '$/progress', params: {} }), 'notification');
  assert.equal(classifyIncoming({ id: 'abc', method: 'workspace/applyEdit' }), 'request');
  assert.equal(classifyIncoming({ id: 'abc', result: null }), 'response');
  // JSON-RPC notifications may carry an explicit null id, which is not a request id.
  assert.equal(classifyIncoming({ id: null, method: 'initialized' }), 'notification');
  assert.equal(classifyIncoming({ params: {} }), 'invalid');
});

test('answers configuration items in request order with the same length', () => {
  const settings = { typescript: { preferences: { quoteStyle: 'single' } }, flat: 1 };
  const answer = resolveConfiguration(settings, {
    items: [
      { section: 'typescript.preferences.quoteStyle' },
      { section: 'typescript.missing' },
      { section: 'flat' },
      {},
    ],
  });
  assert.deepEqual(answer, ['single', null, 1, settings]);
});

test('answers an unknown section with null and a section-less item with the whole tree', () => {
  // `null` is what the spec names for "the client cannot provide this". `{}` would instead assert that
  // a setting exists and is empty, which a server may use to overwrite its own defaults.
  assert.deepEqual(resolveConfiguration({}, { items: [{ section: 'impactLens' }] }), [null]);
  assert.deepEqual(resolveConfiguration({}, { items: [{}] }), [{}]);
});

test('ignores scopeUri because the session has exactly one workspace folder', () => {
  const settings = { a: 1 };
  const answer = resolveConfiguration(settings, {
    items: [
      { section: 'a', scopeUri: 'file:///inside' },
      { section: 'a', scopeUri: 'file:///somewhere/else/entirely' },
    ],
  });
  assert.deepEqual(answer, [1, 1]);
});

test('rejects configuration params without an items array instead of guessing', () => {
  assert.equal(resolveConfiguration({}, undefined), undefined);
  assert.equal(resolveConfiguration({}, { items: 'all' }), undefined);
});

test('never hands the server an alias of the session settings tree', () => {
  const settings = { nested: { list: [{ deep: true }] } };
  const answer = resolveConfiguration(settings, { items: [{ section: 'nested' }] }) as any[];
  assert.deepEqual(answer[0], settings.nested);
  assert.notEqual(answer[0], settings.nested);
  assert.notEqual(answer[0].list[0], settings.nested.list[0]);
});

test('leaves a dotted key reachable only through its parent object', () => {
  // Values legitimately contain dotted keys (glob maps), so a dotted key cannot be forbidden. It is
  // simply unreachable as a section path, and that limit is stated rather than papered over with a
  // flat-key fallback that would need a tie-break rule.
  const settings = { files: { 'exclude.globs': ['**/*.ts'] } };
  assert.equal(lookupSection(settings, 'files.exclude.globs'), undefined);
  assert.deepEqual(lookupSection(settings, 'files'), settings.files);
});

test('does not walk into inherited properties', () => {
  assert.equal(lookupSection({}, 'constructor'), undefined);
  assert.equal(lookupSection({}, 'toString'), undefined);
});

test('clone keeps scalars and arrays structurally equal', () => {
  const value = { a: [1, 'two', true, null], b: { c: 3 } };
  assert.deepEqual(clone(value), value);
  assert.notEqual(clone(value).a, value.a);
});

test('the response table answers honestly rather than conveniently', () => {
  const handlers = createServerRequestHandlers({
    workspaceFolders: [{ uri: 'file:///w', name: 'w' }],
    settings: {},
  });
  // Impact Lens is read-only and has no editor. Claiming an edit was applied or a document was shown
  // would make a server act on something that never happened.
  assert.deepEqual(handlers.get('workspace/applyEdit')!({}), { kind: 'result', value: { applied: false } });
  assert.deepEqual(handlers.get('window/showDocument')!({}), { kind: 'result', value: { success: false } });
  assert.deepEqual(handlers.get('client/registerCapability')!({}), { kind: 'result', value: null });
  assert.deepEqual(handlers.get('workspace/workspaceFolders')!(null), {
    kind: 'result',
    value: [{ uri: 'file:///w', name: 'w' }],
  });
  assert.deepEqual(handlers.get('workspace/diagnostic/refresh')!({}), { kind: 'result', value: null });
  assert.equal(handlers.has('$/anythingElse'), false);
  assert.equal(methodNotFound('$/anythingElse').kind, 'error');
  assert.equal((methodNotFound('$/anythingElse') as { code: number }).code, -32601);
});

test('records capability registrations and progress tokens without treating them as readiness', () => {
  const registered: string[] = [];
  const tokens: Array<string | number> = [];
  const handlers = createServerRequestHandlers({
    workspaceFolders: [],
    settings: {},
    onRegisterCapability: entries => registered.push(...entries.map(entry => entry.method)),
    onWorkDoneProgressCreate: token => tokens.push(token),
  });
  handlers.get('client/registerCapability')!({
    registrations: [{ id: 'a', method: 'textDocument/didChangeWatchedFiles' }, { id: 'b' }],
  });
  handlers.get('window/workDoneProgress/create')!({ token: 'indexing' });
  assert.deepEqual(registered, ['textDocument/didChangeWatchedFiles']);
  assert.deepEqual(tokens, ['indexing']);
  // A token without one is not a token at all, and inventing one would let a later `$/progress` be
  // attributed to work nobody asked for.
  assert.equal(handlers.get('window/workDoneProgress/create')!({}).kind, 'error');
});
