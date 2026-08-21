import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAdminUser } from './adminApi.js';

test('normalizeAdminUser keeps role and status values normalized', () => {
  const normalized = normalizeAdminUser({
    id: 12,
    name: '  Иван Петров  ',
    email: 'ivan@example.com',
    profileStatus: 'BLOCKED',
    role: 'ADMIN',
    isVerified: '1',
    loginLogs: [{ id: 1, isSuccess: true, loggedAt: '2025-01-01T10:00:00' }],
  });

  assert.equal(normalized.id, 12);
  assert.equal(normalized.name, 'Иван Петров');
  assert.equal(normalized.profileStatus, 'blocked');
  assert.equal(normalized.role, 'admin');
  assert.equal(normalized.isVerified, true);
  assert.equal(normalized.loginLogs.length, 1);
});
