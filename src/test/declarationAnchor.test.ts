import assert from 'node:assert/strict';
import test from 'node:test';
import { findDeclarationAnchor } from '../declarationAnchor';

test('moves a provider selection from return usage to a Python declaration', () => {
  const lines = [
    '@router.get("/orders")',
    'async def list_orders(service: OrderService):',
    '    return service.list_orders()',
  ];
  const anchor = findDeclarationAnchor(lines, {
    name: 'list_orders',
    symbolRange: range(0, 2),
    providerSelection: point(2, 19),
  });

  assert.deepEqual(anchor, { line: 1, character: 10 });
});

test('keeps a valid provider selection on a function name', () => {
  const lines = ['export function calculateTotal(items: Item[]) {', '  return 0;', '}'];
  const selection = point(0, 16);
  assert.deepEqual(findDeclarationAnchor(lines, {
    name: 'calculateTotal',
    symbolRange: range(0, 2),
    providerSelection: selection,
  }), selection.start);
});

test('finds methods and arrow functions', () => {
  const methodLines = ['class Service {', '  public loadOrder(id: string): Order {', '    return repo.load(id);', '  }', '}'];
  const arrowLines = ['const loadOrder: Loader = async (id) => {', '  return repo.load(id);', '};'];

  assert.deepEqual(findDeclarationAnchor(methodLines, {
    name: 'loadOrder',
    symbolRange: range(1, 3),
    providerSelection: point(2, 16),
  }), { line: 1, character: 9 });
  assert.deepEqual(findDeclarationAnchor(arrowLines, {
    name: 'loadOrder',
    symbolRange: range(0, 2),
    providerSelection: point(1, 14),
  }), { line: 0, character: 6 });
});

test('falls back to the symbol start rather than a body selection', () => {
  const lines = ['@callable', 'value = factory()', 'return value'];
  assert.deepEqual(findDeclarationAnchor(lines, {
    name: 'unknown',
    symbolRange: range(0, 2),
    providerSelection: point(2, 7),
  }), { line: 0, character: 0 });
});

function point(line: number, character: number) {
  return { start: { line, character }, end: { line, character } };
}

function range(startLine: number, endLine: number) {
  return {
    start: { line: startLine, character: 0 },
    end: { line: endLine, character: 80 },
  };
}
