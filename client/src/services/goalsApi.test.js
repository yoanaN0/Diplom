import test from 'node:test';
import assert from 'node:assert/strict';

import { getGoalRefundByWallet } from './goalsApi.js';

test('getGoalRefundByWallet aggregates direct wallet funding for a goal', () => {
  const transactions = [
    { goalId: 7, walletId: 1, amount: 100, type: 'expense' },
    { goalId: 7, walletId: 1, amount: 25, type: 'expense' },
    { goalId: 7, walletId: 2, amount: 40, type: 'expense' },
    { goalId: 7, walletId: null, amount: 90, type: 'expense' },
    { goalId: 8, walletId: 1, amount: 100, type: 'expense' },
  ];

  assert.deepEqual(getGoalRefundByWallet(transactions, 7), {
    1: 125,
    2: 40,
  });
});

test('getGoalRefundByWallet can narrow the refund to a chosen wallet', () => {
  const transactions = [
    { goalId: 7, walletId: 1, amount: 100, type: 'expense' },
    { goalId: 7, walletId: 1, amount: 25, type: 'expense' },
    { goalId: 7, walletId: 2, amount: 40, type: 'expense' },
    { goalId: 8, walletId: 2, amount: 90, type: 'expense' },
  ];

  assert.deepEqual(getGoalRefundByWallet(transactions, 7, 2), {
    2: 40,
  });
});

