import test from 'node:test';
import assert from 'node:assert/strict';

import { getGoalRefundByWallet, getWalletSavingsByGoal, isGoalCompleted } from './goalsApi.js';

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

test('isGoalCompleted marks goals with saved amount at or above target as completed', () => {
  assert.equal(isGoalCompleted({ saved: 250, target: 250, status: 'active' }), true);
  assert.equal(isGoalCompleted({ saved: 120, target: 250, status: 'active' }), false);
  assert.equal(isGoalCompleted({ saved: 0, target: 0, status: 'funded' }), true);
});

test('getWalletSavingsByGoal sums real wallet contributions from active goals only', () => {
  const goals = [
    { status: 'active', saved: 3000, fundingWallets: [{ walletId: 1, amount: 5000 }, { walletId: 2, amount: 1200 }] },
    { status: 'completed', saved: 2000, fundingWallets: [{ walletId: 1, amount: 99999 }] },
    { status: 'active', saved: 700, fundingWallets: [{ walletId: 1, amount: 1500 }, { walletId: 1, amount: 1200 }] },
  ];

  const result = getWalletSavingsByGoal(goals);

  assert.equal(result[1], 7700);
  assert.equal(result[2], 1200);
  assert.equal(Object.keys(result).length, 2);
});

