import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeBudget } from './budgetsApi.js';

test('normalizeBudget keeps the fixed-expense flag', () => {
  const normalized = normalizeBudget({
    id: 7,
    category: 'Комунални',
    limit: 250,
    spent: 50,
    period: 'monthly',
    isFixed: true,
  });

  assert.equal(normalized.isFixed, true);
  assert.equal(normalized.type, 'fixed');
});
