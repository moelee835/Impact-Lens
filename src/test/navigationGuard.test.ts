import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesPendingNavigation, PendingNavigation } from '../navigationGuard';

const pending: PendingNavigation = {
  uri: 'file:///workspace/service.ts',
  range: {
    start: { line: 10, character: 2 },
    end: { line: 10, character: 9 },
  },
};

test('matches only the exact graph-originated selection', () => {
  assert.equal(matchesPendingNavigation(pending, pending.uri, pending.range), true);
  assert.equal(matchesPendingNavigation(pending, 'file:///workspace/other.ts', pending.range), false);
  assert.equal(matchesPendingNavigation(pending, pending.uri, {
    start: pending.range.start,
    end: { line: 11, character: 0 },
  }), false);
});
