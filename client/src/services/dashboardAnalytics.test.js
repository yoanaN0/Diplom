import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateCashFlowForMonth, calculateDashboardData } from './dashboardAnalytics.js';

test('calculateCashFlowForMonth sums the current month income and expense', () => {
  const now = new Date('2026-06-15T12:00:00');
  const transactions = [
    { type: 'income', amount: 3000, date: '2026-06-02T10:00:00' },
    { type: 'income', amount: 1000, date: '2026-05-28T10:00:00' },
    { type: 'expense', amount: 1400, date: '2026-06-12T10:00:00' },
    { type: 'expense', amount: 2200, date: '2026-07-01T10:00:00' },
  ];

  const result = calculateCashFlowForMonth(transactions, now);

  assert.equal(result.income, 3000);
  assert.equal(result.expense, 1400);
  assert.equal(result.maxValue, 3000);
});

test('calculateDashboardData updates income and expense totals for a 6-month range', () => {
  const now = new Date('2026-06-15T12:00:00');
  const transactions = [
    { type: 'income', amount: 1200, date: '2026-02-10T10:00:00' },
    { type: 'income', amount: 2300, date: '2026-06-02T10:00:00' },
    { type: 'expense', amount: 700, date: '2026-04-10T10:00:00' },
    { type: 'expense', amount: 900, date: '2026-06-12T10:00:00' },
  ];

  const result = calculateDashboardData(transactions, [], [], 5000, '6months', now);

  assert.equal(result.summary.income, 3500);
  assert.equal(result.summary.expense, 1600);
});

test('calculateDashboardData ignores fixed budgets in the risky budgets indicator', () => {
  const now = new Date('2026-06-15T12:00:00');
  const budgets = [
    { id: 1, category: 'Сметка', limit: 300, spent: 290, isFixed: true },
    { id: 2, category: 'Храна', limit: 500, spent: 420, isFixed: false },
    { id: 3, category: 'Транспорт', limit: 200, spent: 180, type: 'fixed' },
  ];

  const result = calculateDashboardData([], [], budgets, 5000, 'month', now);

  assert.equal(result.riskyBudgets.length, 1);
  assert.equal(result.riskyBudgets[0].category, 'Храна');
  assert.ok(result.riskyBudgets.every((budget) => !budget.isFixed && budget.type !== 'fixed'));
});
