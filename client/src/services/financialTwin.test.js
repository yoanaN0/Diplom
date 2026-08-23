import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFinancialTwinBaseline,
  projectFinancialTwinScenario,
  compareTwinScenarios,
  calculateAnnuityPayment,
} from "./financialTwin.js";

const NOW = new Date(2026, 7, 15);

function monthDate(monthsBack, day = 5) {
  return new Date(NOW.getFullYear(), NOW.getMonth() - monthsBack, day).toISOString();
}

test("Редовна заплата се разпознава като recurring income", () => {
  const transactions = [];
  for (let i = 0; i < 6; i += 1) {
    transactions.push({
      date: monthDate(i, 5),
      amount: 1800,
      type: "income",
      category: "Заплата",
      title: "Заплата",
    });
  }

  const baseline = buildFinancialTwinBaseline(transactions, NOW);

  assert.equal(baseline.recurringIncomes.length, 1);
  assert.equal(baseline.recurringIncomes[0].amount, 1800);
  assert.ok(baseline.recurringIncomes[0].confidence > 0.8);
});

test("Единична транзакция не е recurring", () => {
  const transactions = [
    { date: monthDate(1), amount: 500, type: "expense", category: "Пътувания", title: "Билет" },
  ];

  const baseline = buildFinancialTwinBaseline(transactions, NOW);

  assert.equal(baseline.recurringExpenses.length, 0);
});

test("Транзакции тип спестяване се изключват от baseline", () => {
  const transactions = [
    { date: monthDate(0), amount: 300, type: "transfer", category: "Спестяване", title: "Трансфер към цел: Ваканция" },
    { date: monthDate(1), amount: 300, type: "transfer", category: "Спестяване", title: "Трансфер към цел: Ваканция" },
  ];

  const baseline = buildFinancialTwinBaseline(transactions, NOW);

  assert.equal(baseline.recurringExpenses.length, 0);
  assert.equal(baseline.variableExpenses.length, 0);
});

test("Netflix recurring не изключва цялата категория Абонаменти", () => {
  const transactions = [];

  for (let i = 0; i < 6; i += 1) {
    transactions.push({
      date: monthDate(i, 10),
      amount: 45.99,
      type: "expense",
      category: "Абонаменти",
      title: "Netflix",
    });
  }

  transactions.push({
    date: monthDate(1, 20),
    amount: 120,
    type: "expense",
    category: "Абонаменти",
    title: "Онлайн курс",
  });

  const baseline = buildFinancialTwinBaseline(transactions, NOW);

  const subscriptionsRecurring = baseline.recurringExpenses.find((entry) => entry.category === "Абонаменти");
  assert.ok(subscriptionsRecurring);
  assert.equal(subscriptionsRecurring.amount, 45.99);

  const variableSubs = baseline.variableExpenses.find((entry) => entry.category === "Абонаменти");
  assert.ok(variableSubs);
  assert.equal(variableSubs.totalSpent, 120);
});

test("Ниска confidence намалява amount спрямо baseAmount", () => {
  const transactions = [
    { date: monthDate(0, 3), amount: 200, type: "expense", category: "Пътувания", title: "Хотел" },
  ];

  const baseline = buildFinancialTwinBaseline(transactions, NOW);
  const travel = baseline.variableExpenses.find((entry) => entry.category === "Пътувания");

  assert.ok(travel);
  assert.ok(travel.confidence < 0.5);
  assert.ok(travel.amount < travel.baseAmount);
  assert.ok(travel.amount > 0);
});

test("Реалистично вариращ разход остава variable, не recurring", () => {
  const transactions = [];
  const amounts = [180, 220, 270, 330, 400, 490];

  amounts.forEach((amount, i) => {
    transactions.push({
      date: monthDate(5 - i, 15),
      amount,
      type: "expense",
      category: "Хранителни стоки",
      title: "Супермаркет",
    });
  });

  const baseline = buildFinancialTwinBaseline(transactions, NOW);
  const groceries = baseline.variableExpenses.find((entry) => entry.category === "Хранителни стоки");

  assert.ok(groceries, "Категорията трябва да остане variable заради вариращите суми");
  assert.equal(baseline.recurringExpenses.some((entry) => entry.category === "Хранителни стоки"), false);
});

test("projectFinancialTwinScenario смята баланса коректно без модификатори", () => {
  const transactions = [];
  for (let i = 0; i < 6; i += 1) {
    transactions.push({
      date: monthDate(i, 1),
      amount: 2000,
      type: "income",
      category: "Заплата",
      title: "Заплата",
    });
    transactions.push({
      date: monthDate(i, 5),
      amount: 500,
      type: "expense",
      category: "Наем",
      title: "Наем",
    });
  }

  const baseline = buildFinancialTwinBaseline(transactions, NOW);
  const startBalance = 1000;

  const projection = projectFinancialTwinScenario({
    startBalance,
    baseline,
    months: 3,
    startDate: NOW,
  });

  assert.equal(projection.points.length, 3);

  const expectedMonthlyNet = 2000 - 500;
  const expectedEndingBalance = startBalance + expectedMonthlyNet * 3;

  assert.equal(projection.endingBalance, expectedEndingBalance);
  assert.equal(projection.firstNegativeMonthIndex, null);
});

test("spendingCuts намалява разход само за зададената категория", () => {
  const transactions = [];
  const restaurantAmounts = [150, 190, 235, 285, 345, 420];

  restaurantAmounts.forEach((amount, i) => {
    transactions.push({
      date: monthDate(5 - i, 1),
      amount: 2000,
      type: "income",
      category: "Заплата",
      title: "Заплата",
    });
    transactions.push({
      date: monthDate(5 - i, 12),
      amount,
      type: "expense",
      category: "Ресторанти",
      title: "Навън",
    });
  });

  const baseline = buildFinancialTwinBaseline(transactions, NOW);

  const withoutCut = projectFinancialTwinScenario({
    startBalance: 0,
    baseline,
    months: 3,
    startDate: NOW,
  });

  const withCut = projectFinancialTwinScenario({
    startBalance: 0,
    baseline,
    months: 3,
    startDate: NOW,
    modifiers: {
      spendingCuts: [{ category: "Ресторанти", percent: 50, startMonth: 0 }],
    },
  });

  assert.ok(withCut.endingBalance > withoutCut.endingBalance);
});

test("Loan principal влиза еднократно, вноските са за срока на заема", () => {
  const baseline = { recurringIncomes: [], recurringExpenses: [], variableExpenses: [] };

  const projection = projectFinancialTwinScenario({
    startBalance: 0,
    baseline,
    months: 6,
    startDate: NOW,
    modifiers: {
      loan: { principal: 6000, annualRate: 0, months: 3, startMonth: 1 },
    },
  });

  const expectedPayment = calculateAnnuityPayment(6000, 0, 3);

  assert.equal(projection.points[0].income, 0);
  assert.equal(projection.points[0].expense, 0);

  assert.equal(projection.points[1].income, 6000);
  assert.equal(projection.points[1].expense, expectedPayment);

  assert.equal(projection.points[2].expense, expectedPayment);
  assert.equal(projection.points[3].expense, expectedPayment);

  assert.equal(projection.points[4].expense, 0);
});

test("compareTwinScenarios връща коректна deltaEndingBalance", () => {
  const baseline = { recurringIncomes: [], recurringExpenses: [], variableExpenses: [] };

  const comparison = compareTwinScenarios({
    startBalance: 1000,
    baseline,
    months: 6,
    startDate: NOW,
    modifiers: {
      incomeChange: { amount: 200, startMonth: 0 },
    },
  });

  const expectedDelta = 200 * 6;
  assert.equal(comparison.deltaEndingBalance, expectedDelta);
});

test("При spendingCut и spendingCuts едновременно, spendingCuts има приоритет", () => {
  const baseline = {
    recurringIncomes: [],
    recurringExpenses: [],
    variableExpenses: [
      {
        category: "Ресторанти",
        totalSpent: 1200,
        monthsOfData: 3,
        amount: 400,
        baseAmount: 400,
        confidence: 0.5,
      },
    ],
  };

  const projection = projectFinancialTwinScenario({
    startBalance: 0,
    baseline,
    months: 1,
    startDate: NOW,
    modifiers: {
      spendingCut: { category: "Ресторанти", percent: 10, startMonth: 0 },
      spendingCuts: [{ category: "Ресторанти", percent: 90, startMonth: 0 }],
    },
  });

  const restaurantBase = baseline.variableExpenses.find((entry) => entry.category === "Ресторанти")?.amount || 0;
  const expectedExpense = Number((restaurantBase * (1 - 0.9)).toFixed(2));

  assert.equal(projection.points[0].expense, expectedExpense);
});
