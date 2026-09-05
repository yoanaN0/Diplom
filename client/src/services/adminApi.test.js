import test from 'node:test';
import assert from 'node:assert/strict';

import { getAdminCsrfToken, getAdminOverview, normalizeAdminUser, updateUserProfileStatus } from './adminApi.js';

test('normalizeAdminUser keeps status values normalized', () => {
  const normalized = normalizeAdminUser({
    id: 12,
    name: '  Иван Петров  ',
    email: 'ivan@example.com',
    profileStatus: 'BLOCKED',
    isVerified: '1',
  });

  assert.equal(normalized.id, 12);
  assert.equal(normalized.name, 'Иван Петров');
  assert.equal(normalized.profileStatus, 'blocked');
  assert.equal(normalized.isVerified, true);
});

test('getAdminOverview caches csrf token and updateUserProfileStatus sends it', async () => {
  const originalFetch = globalThis.fetch;
  const fetchCalls = [];

  globalThis.fetch = async (url, options = {}) => {
    fetchCalls.push({ url, options });

    if (fetchCalls.length === 1) {
      return {
        ok: true,
        async json() {
          return {
            ok: true,
            csrfToken: 'csrf-123',
            stats: {
              totalUsersCount: 3,
              verifiedUsersCount: 2,
              blockedUsersCount: 1,
            },
            pagination: {
              page: 2,
              pageSize: 20,
              totalUsers: 35,
              totalPages: 2,
            },
            users: [
              {
                id: 7,
                name: '  Мария Иванова ',
                email: 'maria@example.com',
                registeredAt: '2026-09-01T10:00:00',
                profileStatus: 'ACTIVE',
                isVerified: 1,
              },
            ],
          };
        },
      };
    }

    return {
      ok: true,
      async json() {
        return {
          ok: true,
          user: {
            id: 7,
            name: 'Мария Иванова',
            email: 'maria@example.com',
            registeredAt: '2026-09-01T10:00:00',
            profileStatus: 'blocked',
            isVerified: 1,
          },
        };
      },
    };
  };

  try {
    const overview = await getAdminOverview({ search: 'maria@example.com', page: 2 });

    assert.equal(getAdminCsrfToken(), 'csrf-123');
    assert.equal(overview.stats.totalUsersCount, 3);
    assert.equal(overview.stats.verifiedUsersCount, 2);
    assert.equal(overview.stats.blockedUsersCount, 1);
    assert.equal(overview.pagination.page, 2);
    assert.equal(overview.pagination.pageSize, 20);
    assert.equal(overview.users.length, 1);
    assert.equal(overview.users[0].profileStatus, 'active');
    assert.equal(overview.users[0].isVerified, true);

    const updated = await updateUserProfileStatus(7, 'blocked');
    assert.equal(updated.profileStatus, 'blocked');
    assert.equal(fetchCalls.length, 2);
    assert.equal(fetchCalls[1].options.headers['X-CSRF-Token'], 'csrf-123');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
