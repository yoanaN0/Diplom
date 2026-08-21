import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFinancialTwinBaseline,
  calculateAnnuityPayment,
  projectFinancialTwinScenario,
  compareTwinScenarios,
} from "./financialTwin.js";

const sampleTransactions = [
  {
    id: "1",
    type: "income",
    title: "Заплата",
    amount: 2000,
    category: "Доход",
    date: "2026-04-05T10:00:00",
  },
  {
    id: "2",
    type: "income",
    title: "Заплата",
    amount: 2000,
    category: "Доход",
    date: "2026-05-05T10:00:00",
  },
  {
    id: "3",
    type: "income",
    title: "Заплата",
    amount: 2000,
    category: "Доход",
    date: "2026-06-05T10:00:00",
  },
  {
    id: "4",
    type: "expense",
    title: "Наем",
    amount: 700,
    category: "Жилище",
    date: "2026-04-02T10:00:00",
  },
  {
    id: "5",
    type: "expense",
    title: "Наем",
    amount: 700,
    category: "Жилище",
    date: "2026-05-02T10:00:00",
  },
  {
    id: "6",
    type: "expense",
    title: "Наем",
    amount: 700,
    category: "Жилище",
    date: "2026-06-02T10:00:00",
  },
  {
    id: "7",
    type: "expense",
    title: "Супермаркет",
    amount: 250,
    category: "Храна",
    date: "2026-06-10T18:00:00",
  },
];

test("buildFinancialTwinBaseline detects monthly recurring income and expense", () => {
  const baseline = buildFinancialTwinBaseline(sampleTransactions, new Date("2026-06-30T12:00:00"));

  assert.equal(baseline.recurringIncomes.length, 1);
  assert.equal(baseline.recurringIncomes[0].title, "Заплата");

  assert.equal(baseline.recurringExpenses.length, 1);
  assert.equal(baseline.recurringExpenses[0].title, "Наем");

  assert.equal(baseline.variableExpenses.length, 1);
  assert.equal(baseline.variableExpenses[0].category, "Храна");
});

test("calculateAnnuityPayment returns expected monthly payment", () => {
  const payment = calculateAnnuityPayment(10000, 12, 12);
  assert.ok(payment > 880 && payment < 890, `Unexpected payment: ${payment}`);
});

test("compareTwinScenarios applies one-time expense and income change", () => {
  const baseline = buildFinancialTwinBaseline(sampleTransactions, new Date("2026-06-30T12:00:00"));

  const result = compareTwinScenarios({
    startBalance: 500,
    baseline,
    months: 6,
    modifiers: {
      incomeChange: { amount: 200, startMonth: 1 },
      oneTimeExpense: { amount: 300, month: 2 },
    },
  });

  assert.ok(result.scenarioProjection.points.length === 6);
  assert.ok(Number.isFinite(result.deltaEndingBalance));
  assert.ok(result.scenarioProjection.endingBalance > result.baselineProjection.endingBalance);
});

test("projectFinancialTwinScenario deducts loan payment every month during term", () => {
  const projection = projectFinancialTwinScenario({
    startBalance: 0,
    baseline: {
      recurringIncomes: [],
      recurringExpenses: [],
      variableExpenses: [],
    },
    months: 5,
    startDate: new Date("2026-01-01T00:00:00"),
    modifiers: {
      loan: {
        principal: 1200,
        annualRate: 0,
        months: 3,
        startMonth: 1,
      },
    },
  });

  const balances = projection.points.map((item) => item.balance);
  assert.deepEqual(balances, [0, 800, 400, 0, 0]);
});

test("projectFinancialTwinScenario applies spending cut only from cutStartMonth", () => {
  // 100 monthly variable expense in "Храна", cut by 50% starting from month 2
  const baseline = {
    recurringIncomes: [],
    recurringExpenses: [],
    variableExpenses: [{ category: "Храна", amount: 100 }],
  };

  const projection = projectFinancialTwinScenario({
    startBalance: 0,
    baseline,
    months: 4,
    startDate: new Date("2026-01-01T00:00:00"),
    modifiers: {
      spendingCut: { category: "Храна", percent: 50, startMonth: 2 },
    },
  });

  const expenses = projection.points.map((item) => item.expense);
  // months 0,1 → full 100; months 2,3 → reduced 50
  assert.deepEqual(expenses, [100, 100, 50, 50]);
});
