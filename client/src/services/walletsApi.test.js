import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeWallet } from './walletsApi.js';

test('normalizeWallet does not treat updatedAt as a CSV import timestamp', () => {
  const wallet = normalizeWallet({
    id: 9,
    walletType: 'bank',
    name: 'Bank Card',
    balance: 150,
    bank: 'Test Bank',
    account: '4242',
    status: 'Свързана',
    updatedAt: '2026-09-02T10:00:00',
  });

  assert.equal(wallet.lastSync, null);
});

test('normalizeWallet keeps a real lastSync timestamp when one exists', () => {
  const wallet = normalizeWallet({
    id: 10,
    walletType: 'bank',
    name: 'Bank Card',
    balance: 200,
    bank: 'Test Bank',
    account: '4242',
    status: 'Свързана',
    lastSync: '2026-09-01T08:00:00',
  });

  assert.equal(wallet.lastSync, '2026-09-01T08:00:00');
});
