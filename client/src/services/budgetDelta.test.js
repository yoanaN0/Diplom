import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateBudgetDelta } from './budgetDelta.js';

test('calculateBudgetDelta adds expense amounts to budget spent', () => {
  assert.equal(calculateBudgetDelta('expense', 120), 120);
  assert.equal(calculateBudgetDelta('income', 120), 0);
  assert.equal(calculateBudgetDelta('transfer', 120), 0);
});
