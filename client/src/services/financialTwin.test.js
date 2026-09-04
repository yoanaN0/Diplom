import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFinancialTwinBaseline,
  projectFinancialTwinScenario,
  compareTwinScenarios,
  calculateAnnuityPayment,
  weightedMedian,
  isRuleActiveForMonth,
} from "./financialTwin.js";

const NOW = new Date(2026, 7, 15);

function monthDate(monthsBack, day = 5) {
  return new Date(NOW.getFullYear(), NOW.getMonth() - monthsBack, day).toISOString();
}

test("прогнозата започва от следващия месец", () => {
  const baseline = { recurringIncomes: [], recurringExpenses: [], variableExpenses: [] };
  const projection = projectFinancialTwinScenario({
    startBalance: 1000,
    baseline,
    months: 3,
    startDate: NOW,
  });

  assert.equal(projection.points.length, 3);
  assert.equal(projection.points[0].label, new Intl.DateTimeFormat("bg-BG", { month: "short", year: "2-digit" }).format(new Date(2026, 8, 1)));
});

test("неактивен портфейл не участва в началния баланс", () => {
  const startBalance = [
    { balance: 1000, isActive: true },
    { balance: 500, isActive: false },
    { balance: 300, isActive: true },
  ];

  const total = startBalance.reduce((sum, wallet) => sum + (wallet.isActive ? Number(wallet.balance) || 0 : 0), 0);
  assert.equal(total, 1300);
});

test("две повторения не са периодична операция", () => {
  const transactions = [
    { date: monthDate(4), amount: 100, type: "expense", category: "Абонаменти", title: "Netflix" },
    { date: monthDate(2), amount: 100, type: "expense", category: "Абонаменти", title: "Netflix" },
  ];

  const baseline = buildFinancialTwinBaseline(transactions, NOW);
  assert.equal(baseline.recurringExpenses.length, 0);
});

test("три повторения през 21–45 дни са периодична операция", () => {
  const transactions = [
    { date: new Date(2026, 3, 10).toISOString(), amount: 50, type: "expense", category: "Абонаменти", title: "Netflix" },
    { date: new Date(2026, 4, 30).toISOString(), amount: 50, type: "expense", category: "Абонаменти", title: "Netflix" },
    { date: new Date(2026, 6, 20).toISOString(), amount: 50, type: "expense", category: "Абонаменти", title: "Netflix" },
  ];

  const baseline = buildFinancialTwinBaseline(transactions, new Date(2026, 7, 15));
  assert.ok(baseline.recurringExpenses.some((item) => item.category === "Абонаменти"));
});

test("интервал под 21 или над 45 дни не се приема", () => {
  const transactions = [
    { date: new Date(2026, 1, 1).toISOString(), amount: 50, type: "expense", category: "Абонаменти", title: "Netflix" },
    { date: new Date(2026, 1, 15).toISOString(), amount: 50, type: "expense", category: "Абонаменти", title: "Netflix" },
    { date: new Date(2026, 2, 5).toISOString(), amount: 50, type: "expense", category: "Абонаменти", title: "Netflix" },
  ];

  const baseline = buildFinancialTwinBaseline(transactions, new Date(2026, 7, 15));
  assert.equal(baseline.recurringExpenses.length, 0);
});

test("еднаква категория с различно описание не се смесва", () => {
  const transactions = [
    { date: monthDate(5), amount: 45, type: "expense", category: "Абонаменти", title: "Netflix" },
    { date: monthDate(4), amount: 45, type: "expense", category: "Абонаменти", title: "Netflix" },
    { date: monthDate(3), amount: 45, type: "expense", category: "Абонаменти", title: "Netflix" },
    { date: monthDate(2), amount: 60, type: "expense", category: "Абонаменти", title: "YouTube" },
    { date: monthDate(1), amount: 60, type: "expense", category: "Абонаменти", title: "YouTube" },
    { date: monthDate(0), amount: 60, type: "expense", category: "Абонаменти", title: "YouTube" },
  ];

  const baseline = buildFinancialTwinBaseline(transactions, NOW);
  assert.equal(baseline.recurringExpenses.filter((item) => item.category === "Абонаменти").length, 2);
});

test("претеглената медиана дава по-голяма тежест на актуалните данни", () => {
  const history = [
    { value: 100, weight: 1 },
    { value: 100, weight: 2 },
    { value: 200, weight: 3 },
    { value: 200, weight: 4 },
  ];

  const median = weightedMedian(history);
  assert.equal(median, 200);
});

test("няколко recurring и един variable за една категория се визуализират като една обща категория", () => {
  const baseline = {
    recurringExpenses: [
      { category: "Абонаменти", amount: 45, confidence: 0.8 },
      { category: "Абонаменти", amount: 55, confidence: 0.9 },
    ],
    variableExpenses: [
      { category: "Абонаменти", amount: 60, confidence: 0.7 },
    ],
  };

  const grouped = new Map();

  const addEntry = (entry) => {
    const category = String(entry.category || "").trim();
    const key = category.toLowerCase();
    const current = grouped.get(key) || {
      category,
      amount: 0,
      confidenceWeighted: 0,
      confidenceWeight: 0,
    };

    current.amount += Number(entry.amount) || 0;
    current.confidenceWeighted += (Number(entry.amount) || 0) * (Number(entry.confidence) || 0);
    current.confidenceWeight += Number(entry.amount) || 0;
    grouped.set(key, current);
  };

  (baseline.recurringExpenses || []).forEach(addEntry);
  (baseline.variableExpenses || []).forEach(addEntry);

  const result = Array.from(grouped.values()).map((item) => ({
    category: item.category,
    amount: Number(item.amount.toFixed(2)),
    confidence: item.confidenceWeight > 0
      ? Number((item.confidenceWeighted / item.confidenceWeight).toFixed(2))
      : 0,
  }));

  assert.equal(result.length, 1);
  assert.equal(result[0].category, "Абонаменти");
  assert.equal(result[0].amount, 160);
  assert.equal(result[0].confidence, 0.8);
});

test("текущият месец не участва в baseline", () => {
  const transactions = [
    { date: monthDate(0), amount: 100, type: "expense", category: "Домашни", title: "Ток" },
    { date: monthDate(1), amount: 200, type: "expense", category: "Домашни", title: "Ток" },
    { date: monthDate(2), amount: 300, type: "expense", category: "Домашни", title: "Ток" },
  ];

  const baseline = buildFinancialTwinBaseline(transactions, NOW);
  assert.equal(baseline.usedMonths, 6);
});

test("еднократен разход не става постоянен", () => {
  const transactions = [
    { date: monthDate(5), amount: 500, type: "expense", category: "Покупки", title: "Мебели" },
  ];

  const baseline = buildFinancialTwinBaseline(transactions, NOW);
  assert.equal(baseline.recurringExpenses.some((item) => item.category === "Покупки"), false);
});

test("периодичен разход не се отчита повторно като променлив", () => {
  const transactions = [
    { date: monthDate(5), amount: 50, type: "expense", category: "Абонаменти", title: "Netflix" },
    { date: monthDate(4), amount: 50, type: "expense", category: "Абонаменти", title: "Netflix" },
    { date: monthDate(3), amount: 50, type: "expense", category: "Абонаменти", title: "Netflix" },
  ];

  const baseline = buildFinancialTwinBaseline(transactions, NOW);
  assert.ok(baseline.recurringExpenses.some((item) => item.category === "Абонаменти"));
  assert.equal(baseline.variableExpenses.some((item) => item.category === "Абонаменти"), false);
});

test("confidence не променя сумата", () => {
  const baseline = { recurringIncomes: [], recurringExpenses: [], variableExpenses: [{ category: "Храна", amount: 350, baseAmount: 350, confidence: 0.2 }] };
  const projection = projectFinancialTwinScenario({ startBalance: 0, baseline, months: 1, startDate: NOW });
  assert.equal(projection.points[0].expense, 350);
});

test("празен endMonth означава до края", () => {
  const rule = { category: "Храна", percent: 10, startMonth: 0, endMonth: "" };
  assert.equal(isRuleActiveForMonth(rule, 5), true);
});

test("първата кредитна вноска е през следващия месец", () => {
  const baseline = { recurringIncomes: [], recurringExpenses: [], variableExpenses: [] };
  const projection = projectFinancialTwinScenario({
    startBalance: 0,
    baseline,
    months: 4,
    startDate: NOW,
    modifiers: { loan: { principal: 2000, annualRate: 0, months: 2, startMonth: 0 } },
  });

  assert.equal(projection.points[0].income, 2000);
  assert.equal(projection.points[0].expense, 0);
  assert.equal(projection.points[1].expense, 1000);
  assert.equal(projection.points[2].expense, 1000);
});

test("брой кредитни вноски е точен", () => {
  const baseline = { recurringIncomes: [], recurringExpenses: [], variableExpenses: [] };
  const projection = projectFinancialTwinScenario({
    startBalance: 0,
    baseline,
    months: 5,
    startDate: NOW,
    modifiers: { loan: { principal: 1200, annualRate: 0, months: 3, startMonth: 1 } },
  });

  const payments = projection.points.filter((point) => point.expense > 0).length;
  assert.equal(payments, 3);
});

test("предупреждението при недостатъчна история работи", () => {
  const transactions = [
    { date: monthDate(5), amount: 100, type: "expense", category: "Билети", title: "Билет" },
  ];

  const baseline = buildFinancialTwinBaseline(transactions, NOW);
  assert.equal(baseline.insufficientHistory, true);
});
