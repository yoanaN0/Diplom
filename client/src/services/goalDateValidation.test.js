import test from 'node:test';
import assert from 'node:assert/strict';

import { isGoalDeadlineValid } from './goalDateValidation.js';

test('goal deadline must be at least one day after today', () => {
  const today = new Date('2026-08-17T12:00:00');

  assert.equal(isGoalDeadlineValid('2026-08-18', today), true);
  assert.equal(isGoalDeadlineValid('2026-08-17', today), false);
  assert.equal(isGoalDeadlineValid('2026-08-16', today), false);
  assert.equal(isGoalDeadlineValid('', today), false);
});
