import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateMonthSpendingProjection,
  calculateSpendingPaceIndicator,
  calculateVariableDailyLimitRecommendation,
  findTopSpendingCategory,
} from './financeData.js';

test('findTopSpendingCategory selects the category burning fastest relative to time', () => {
  const topCategory = findTopSpendingCategory(
    [
      { category: 'Храна', spent: 260, limit: 500 },
      { category: 'Пътувания', spent: 180, limit: 200 },
      { category: 'Разни', spent: 70, limit: 0 },
    ],
    10,
    30,
  );

  assert.equal(topCategory.category, 'Пътувания');
  assert.equal(Math.round(topCategory.percentSpent * 100), 90);
  assert.equal(topCategory.daysElapsed, 10);
  assert.equal(topCategory.daysInMonth, 30);
});

test('findTopSpendingCategory ignores fixed budgets when identifying the variable-category pressure', () => {
  const topCategory = findTopSpendingCategory(
    [
      { category: 'Сметка', spent: 280, limit: 300, isFixed: true },
      { category: 'Храна', spent: 180, limit: 300 },
      { category: 'Пътувания', spent: 120, limit: 250 },
    ],
    10,
    30,
  );

  assert.equal(topCategory.category, 'Храна');
});

test('calculateSpendingPaceIndicator marks a healthy pace within tolerance', () => {
  const indicator = calculateSpendingPaceIndicator(700, 1421, 15, 30);

  assert.equal(indicator.visible, true);
  assert.equal(indicator.emoji, '🟢');
  assert.equal(indicator.label, 'В рамките на бюджета');
  assert.ok(indicator.paceRatio <= 1.05);
});

test('calculateSpendingPaceIndicator marks a risky pace when spending outruns time', () => {
  const indicator = calculateSpendingPaceIndicator(1200, 1421, 20, 30);

  assert.equal(indicator.visible, true);
  assert.equal(indicator.emoji, '🔴');
  assert.equal(indicator.label, 'Над темпото');
  assert.ok(indicator.paceRatio > 1.25);
});

test('calculateSpendingPaceIndicator stays hidden before day 3', () => {
  const indicator = calculateSpendingPaceIndicator(100, 1000, 2, 30);

  assert.equal(indicator.visible, false);
  assert.equal(indicator.label, null);
});

test('calculateVariableDailyLimitRecommendation uses only variable budgets and adapts to overspending', () => {
  const rec = calculateVariableDailyLimitRecommendation(
    [
      { category: 'Сметка', spent: 260, limit: 300, isFixed: true },
      { category: 'Храна', spent: 240, limit: 500 },
      { category: 'Забавления', spent: 100, limit: 200 },
    ],
    new Date('2026-06-15T12:00:00'),
  );

  assert.equal(rec.visible, true);
  assert.match(rec.message, /ограничи се|по-бавно|Точно по план|Вече надвиши/);
  assert.ok(rec.naiveDailyLimit > 0);
  assert.ok(rec.adjustedDailyLimit > 0);
});

test('calculateMonthSpendingProjection warns when spending pace exceeds the budget', () => {
  const projection = calculateMonthSpendingProjection(1600, 1421, new Date('2026-06-20T12:00:00'));

  assert.equal(projection.daysElapsed, 20);
  assert.equal(projection.daysInMonth, 30);
  assert.ok(Math.abs(projection.projectedOverspend - 979) < 0.01);
  assert.match(projection.message, /надвишиш бюджета/);
});

test('calculateMonthSpendingProjection shows reserve when spending pace is safe', () => {
  const projection = calculateMonthSpendingProjection(1071.98, 1421, new Date('2026-06-30T12:00:00'));

  assert.equal(projection.daysElapsed, 30);
  assert.equal(projection.daysInMonth, 30);
  assert.ok(Math.abs(projection.projectedOverspend + 349.02) < 0.01);
  assert.match(projection.message, /резерв/);
});

test('calculateMonthSpendingProjection handles the zero-days edge case gracefully', () => {
  const projection = calculateMonthSpendingProjection(0, 1421, new Date('2026-06-01T12:00:00'), 0, 30);

  assert.equal(projection.daysElapsed, 0);
  assert.equal(projection.message, 'Все още няма достатъчно данни за прогноза');
});
