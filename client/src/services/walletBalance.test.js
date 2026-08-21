import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateWalletDelta } from './walletBalance.js';

test('calculateWalletDelta adds money for income and subtracts for expense', () => {
  assert.equal(calculateWalletDelta('income', 120), 120);
  assert.equal(calculateWalletDelta('expense', 80), -80);
  assert.equal(calculateWalletDelta('transfer', 40), 0);
});
