function toDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysBetween(left, right) {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round(Math.abs(right.getTime() - left.getTime()) / dayMs);
}

function normalizeTitle(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\-_]+/g, " ")
    .replace(/[^a-zа-я0-9 ]/gi, "")
    .replace(/\s+/g, " ");
}

function average(values) {
  if (!values.length) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function clusterByAmount(entries, tolerancePercent = 15) {
  const sorted = entries.slice().sort((left, right) => left.amount - right.amount);
  const clusters = [];

  sorted.forEach((entry) => {
    const lastCluster = clusters[clusters.length - 1];
    if (lastCluster) {
      const refAmount = lastCluster[lastCluster.length - 1].amount;
      const diffPercent = refAmount > 0
        ? (Math.abs(entry.amount - refAmount) / refAmount) * 100
        : 100;

      if (diffPercent <= tolerancePercent) {
        lastCluster.push(entry);
        return;
      }
    }

    clusters.push([entry]);
  });

  return clusters;
}

function normalizeAmount(entry) {
  const raw = Number(entry?.amount);
  if (!Number.isFinite(raw)) {
    return 0;
  }

  return Math.abs(raw);
}

function calculateAnnuityPayment(principal, annualRatePercent, months) {
  const amount = Number(principal) || 0;
  const rate = Number(annualRatePercent) || 0;
  const term = Math.max(1, Number(months) || 1);

  if (amount <= 0) {
    return 0;
  }

  if (rate <= 0) {
    return amount / term;
  }

  const monthlyRate = rate / 100 / 12;
  const factor = Math.pow(1 + monthlyRate, term);
  return amount * ((monthlyRate * factor) / (factor - 1));
}

function createMonthLabel(date) {
  return new Intl.DateTimeFormat("bg-BG", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

function isSavingsLikeTransaction(entry) {
  const title = String(entry?.title || "").trim().toLowerCase();
  const category = String(entry?.category || "").trim().toLowerCase();
  const tags = Array.isArray(entry?.tags) ? entry.tags : [];

  return (
    entry?.type === "transfer" ||
    tags.includes("#goal-transfer") ||
    category === "спестяване" ||
    title.startsWith("трансфер към цел:") ||
    title.includes("спест")
  );
}

function detectRecurringTransactions(transactions, now = new Date()) {
  const historyStart = new Date(
    now.getFullYear(),
    now.getMonth() - (HISTORY_MONTHS - 1),
    1,
  );
  const groups = new Map();

  transactions.forEach((entry) => {
    const date = toDate(entry.date);
    const amount = normalizeAmount(entry);
    const type = entry.type === "income" ? "income" : "expense";
    const incomeCategory = String(entry.category || "").trim();
    const incomeTitle = String(entry.title || "").trim();
    const incomeGroupingBase = incomeCategory || incomeTitle;
    const expenseTitle = String(entry.title || "").trim();
    const expenseCategory = String(entry.category || "").trim();
    const expenseGroupingBase = expenseCategory || expenseTitle;
    const label = type === "income"
      ? normalizeTitle(incomeGroupingBase)
      : normalizeTitle(String(expenseGroupingBase || "Други"));

    if (
      isSavingsLikeTransaction(entry) ||
      !date ||
      date > now ||
      date < historyStart ||
      !label ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return;
    }

    const key = `${type}|${label}`;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        type,
        title: type === "income" ? String(incomeGroupingBase || label) : String(expenseGroupingBase || "Други"),
        rawTitle: type === "income" ? String(incomeGroupingBase || label) : String(expenseGroupingBase || "Други"),
        category: String(entry.category || "Други"),
        entries: [],
      });
    }

    groups.get(key).entries.push({ date, amount });
  });

  const recurring = [];

  groups.forEach((group) => {
    const clusters = clusterByAmount(group.entries, 15);

    clusters.forEach((clusterEntries) => {
      const sorted = clusterEntries
        .slice()
        .sort((left, right) => left.date.getTime() - right.date.getTime());

      if (sorted.length < 2) {
        return;
      }

      const lastOccurrence = sorted[sorted.length - 1].date;

      if (daysBetween(lastOccurrence, now) > RECURRING_ACTIVE_DAYS) {
        return;
      }

      const intervals = [];
      for (let index = 1; index < sorted.length; index += 1) {
        intervals.push(daysBetween(sorted[index - 1].date, sorted[index].date));
      }

      const avgInterval = average(intervals);
      const monthlyLike = avgInterval >= 15 && avgInterval <= 90;
      if (!monthlyLike) {
        return;
      }

      const amounts = sorted.map((item) => item.amount);
      const avgAmount = average(amounts);
      const amountSpread = Math.max(...amounts) - Math.min(...amounts);
      const amountSpreadRatio = avgAmount > 0 ? amountSpread / avgAmount : 0;
      const dayOfMonth = Math.round(average(sorted.map((item) => item.date.getDate())));

      const intervalConfidence = Math.max(0, 1 - Math.abs(30 - avgInterval) / 15);
      const amountConfidence = Math.max(0, 1 - amountSpreadRatio);
      const occurrenceWeight = Math.min(1, (sorted.length - 1) / 4);
      const confidence = Number(
        Math.min(0.99, intervalConfidence * 0.6 + amountConfidence * 0.25 + occurrenceWeight * 0.15)
          .toFixed(2),
      );

      recurring.push({
        key: group.key,
        type: group.type,
        title: group.rawTitle,
        category: group.category,
        amount: Number(avgAmount.toFixed(2)),
        dayOfMonth,
        confidence,
        occurrences: sorted.length,
        matchedEntries: sorted.map((item) => ({
          date: item.date.toISOString(),
          amount: item.amount,
        })),
      });
    });
  });

  return recurring;
}

 
const HISTORY_MONTHS = 6;
const RECURRING_ACTIVE_DAYS = 120;

function buildMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthsAgo(date, now) {
  return (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
}

function weightedMedian(pairs) {
  const sorted = pairs.slice().sort((left, right) => left.value - right.value);
  const totalWeight = sorted.reduce((sum, pair) => sum + pair.weight, 0);

  if (totalWeight === 0) {
    return 0;
  }

  let cumulative = 0;
  for (const pair of sorted) {
    cumulative += pair.weight;
    if (cumulative >= totalWeight / 2) {
      return pair.value;
    }
  }

  return sorted[sorted.length - 1]?.value || 0;
}

function applyConfidenceToEstimate(estimate, confidence) {
  // Keep some base contribution even with sparse data, but scale down low-confidence categories.
  const baseWeight = 0.35;
  const scaledWeight = baseWeight + (1 - baseWeight) * confidence;
  return estimate * scaledWeight;
}

function createRecurringSignature(category, dateValue, amount) {
  const normalizedCategory = normalizeTitle(String(category || "Други"));
  const normalizedDate = toDate(dateValue);
  const normalizedAmount = Number(normalizeAmount({ amount }).toFixed(2));

  if (!normalizedDate || !normalizedCategory || normalizedAmount <= 0) {
    return null;
  }

  return `${normalizedCategory}|${normalizedDate.toISOString()}|${normalizedAmount}`;
}

function buildVariableExpensesPerMonth(transactions, recurringExpenseEntries, now = new Date()) {
  const recurringTransactionSignatures = new Set();
  (recurringExpenseEntries || []).forEach((recurringItem) => {
    (recurringItem?.matchedEntries || []).forEach((entry) => {
      const signature = createRecurringSignature(
        recurringItem.category,
        entry?.date,
        entry?.amount,
      );

      if (signature) {
        recurringTransactionSignatures.add(signature);
      }
    });
  });

  const currentMonthKey = buildMonthKey(now);

  const historyStart = new Date(
    now.getFullYear(),
    now.getMonth() - (HISTORY_MONTHS - 1),
    1,
  );

  const byCategoryMonth = new Map();
  let earliestSeen = null;

  transactions.forEach((entry) => {
    if (entry.type !== "expense" || isSavingsLikeTransaction(entry)) return;

    const date = toDate(entry.date);
    if (!date || date < historyStart || date > now) return;

    const amount = normalizeAmount(entry);
    if (!Number.isFinite(amount) || amount <= 0) return;

    if (!earliestSeen || date < earliestSeen) {
      earliestSeen = date;
    }

    const category = String(entry.category || "Други");
    const signature = createRecurringSignature(category, date, amount);
    if (signature && recurringTransactionSignatures.has(signature)) {
      return;
    }

    const monthKey = buildMonthKey(date);

    if (!byCategoryMonth.has(category)) {
      byCategoryMonth.set(category, new Map());
    }

    const monthMap = byCategoryMonth.get(category);
    monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + amount);
  });

  if (!earliestSeen) return [];

  const results = [];

  byCategoryMonth.forEach((monthMap, category) => {
    const entriesWithoutCurrent = [...monthMap.entries()].filter(([key]) => key !== currentMonthKey);
    const usableEntries = entriesWithoutCurrent.length > 0 ? entriesWithoutCurrent : [...monthMap.entries()];

    const weighted = usableEntries.map(([monthKey, sum]) => {
      const [year, month] = monthKey.split("-").map(Number);
      const monthDate = new Date(year, month - 1, 1);
      const age = monthsAgo(monthDate, now);
      const weight = 1 / (1 + age * 0.5);
      return { value: sum, weight };
    });

    const monthsWithData = usableEntries.length;
    const totalSpentAll = [...monthMap.values()].reduce((sum, value) => sum + value, 0);

    let estimate;
    if (monthsWithData >= 3) {
      estimate = weightedMedian(weighted);
    } else {
      const totalWeight = weighted.reduce((sum, pair) => sum + pair.weight, 0);
      estimate = totalWeight > 0
        ? weighted.reduce((sum, pair) => sum + pair.value * pair.weight, 0) / totalWeight
        : 0;
    }

    const confidence = Math.min(1, monthsWithData / HISTORY_MONTHS);
    const confidenceAdjustedEstimate = applyConfidenceToEstimate(estimate, confidence);

    results.push({
      category,
      totalSpent: Number(totalSpentAll.toFixed(2)),
      monthsOfData: monthsWithData,
      amount: Number(confidenceAdjustedEstimate.toFixed(2)),
      baseAmount: Number(estimate.toFixed(2)),
      confidence: Number(confidence.toFixed(2)),
    });
  });

  return results.sort((left, right) => right.amount - left.amount);
}

export function buildFinancialTwinBaseline(transactions, now = new Date()) {
  const recurring = detectRecurringTransactions(transactions, now);  const recurringIncomes = recurring.filter((item) => item.type === "income");
  const recurringExpenses = recurring.filter((item) => item.type === "expense");
  const variableExpenses = buildVariableExpensesPerMonth(
    transactions,
    recurringExpenses,
    now,
  );

  return {
    recurringIncomes,
    recurringExpenses,
    variableExpenses,
  };
}

function isRuleActiveForMonth(rule, monthIndex) {
  const startMonth = Math.max(0, Number(rule?.startMonth) || 0);
  const hasEndMonth = Number.isFinite(Number(rule?.endMonth)) && Number(rule?.endMonth) >= startMonth;
  const endMonth = hasEndMonth ? Number(rule.endMonth) : null;

  if (monthIndex < startMonth) {
    return false;
  }

  if (endMonth === null) {
    return true;
  }

  return monthIndex <= endMonth;
}

function applySpendingCuts(variableExpenses, spendingCuts, monthIndex = 0) {
  if (!Array.isArray(spendingCuts) || !spendingCuts.length) {
    return variableExpenses;
  }

  return variableExpenses.map((item) => {
    const matchingRule = spendingCuts.find((rule) => {
      if (String(rule?.category || "").trim() !== String(item.category || "").trim()) {
        return false;
      }

      return isRuleActiveForMonth(rule, monthIndex);
    });

    if (!matchingRule) {
      return item;
    }

    const percent = Math.max(0, Math.min(100, Number(matchingRule.percent) || 0));
    if (percent === 0) {
      return item;
    }

    const reduced = item.amount * (1 - percent / 100);
    return { ...item, amount: Number(reduced.toFixed(2)) };
  });
}

function monthStart(baseDate, offset) {
  return new Date(baseDate.getFullYear(), baseDate.getMonth() + offset, 1);
}

export function projectFinancialTwinScenario({
  startBalance,
  baseline,
  months = 12,
  startDate = new Date(),
  modifiers = {},
}) {
  const horizon = Math.max(1, Number(months) || 1);
  const recurringIncomes = baseline?.recurringIncomes || [];
  const recurringExpenses = baseline?.recurringExpenses || [];

  const baseVariableExpenses = baseline?.variableExpenses || [];
  const normalizedSpendingCuts = (() => {
    if (Array.isArray(modifiers.spendingCuts) && modifiers.spendingCuts.length) {
      if (modifiers.spendingCut) {
        console.warn(
          "Подадени са едновременно 'spendingCut' и 'spendingCuts' — 'spendingCut' се игнорира.",
        );
      }

      return modifiers.spendingCuts;
    }

    if (modifiers.spendingCut) {
      const cut = modifiers.spendingCut;
      const categories = Array.isArray(cut.categories)
        ? cut.categories
        : cut.category
          ? [cut.category]
          : [];

      return categories.map((category) => ({
        category,
        percent: cut.percent,
        startMonth: cut.startMonth,
        endMonth: cut.endMonth,
      }));
    }

    return [];
  })();

  const additionalIncome = Number(modifiers.incomeChange?.amount) || 0;
  const additionalIncomeStart = Math.max(0, Number(modifiers.incomeChange?.startMonth ?? 0));

  const oneTimeExpenseAmount = Number(modifiers.oneTimeExpense?.amount) || 0;
  const oneTimeExpenseMonth = Math.max(0, Number(modifiers.oneTimeExpense?.month ?? 0));
  const oneTimeIncomeAmount = Number(modifiers.oneTimeIncome?.amount) || 0;
  const oneTimeIncomeMonth = Math.max(0, Number(modifiers.oneTimeIncome?.month ?? 0));

  const loanPrincipal = Number(modifiers.loan?.principal) || 0;
  const loanAnnualRate = Number(modifiers.loan?.annualRate) || 0;
  const loanTerm = Math.max(1, Number(modifiers.loan?.months) || 1);
  const loanStart = Math.max(0, Number(modifiers.loan?.startMonth ?? 0));
  const loanPayment = calculateAnnuityPayment(loanPrincipal, loanAnnualRate, loanTerm);

  if (loanPrincipal > 0 && loanStart >= horizon) {
    console.warn(
      `Кредит стартира на месец ${loanStart}, но хоризонтът е само ${horizon} месеца — сценарият няма ефект.`,
    );
  }

  let balance = Number(startBalance) || 0;
  let minimumBalance = balance;
  let firstNegativeMonthIndex = null;

  const points = [];

  for (let monthIndex = 0; monthIndex < horizon; monthIndex += 1) {
    const date = monthStart(startDate, monthIndex);

    const recurringIncomeAmount = recurringIncomes.reduce((sum, item) => sum + item.amount, 0);
    const recurringExpenseAmount = recurringExpenses.reduce((sum, item) => sum + item.amount, 0);
    const activeVariableExpenses = normalizedSpendingCuts.length
      ? applySpendingCuts(baseVariableExpenses, normalizedSpendingCuts, monthIndex)
      : baseVariableExpenses;
    const variableExpenseAmount = activeVariableExpenses.reduce((sum, item) => sum + item.amount, 0);

    let monthIncome = recurringIncomeAmount;
    let monthExpense = recurringExpenseAmount + variableExpenseAmount;

    if (monthIndex >= additionalIncomeStart) {
      monthIncome += additionalIncome;
    }

    if (oneTimeExpenseAmount > 0 && monthIndex === oneTimeExpenseMonth) {
      monthExpense += oneTimeExpenseAmount;
    }

    if (oneTimeIncomeAmount > 0 && monthIndex === oneTimeIncomeMonth) {
      monthIncome += oneTimeIncomeAmount;
    }

    if (loanPrincipal > 0 && monthIndex === loanStart) {
      monthIncome += loanPrincipal;
    }

    const loanEnd = loanStart + loanTerm;
    if (loanPrincipal > 0 && monthIndex >= loanStart && monthIndex < loanEnd) {
      monthExpense += loanPayment;
    }

    balance += monthIncome - monthExpense;

    if (balance < minimumBalance) {
      minimumBalance = balance;
    }

    if (balance < 0 && firstNegativeMonthIndex === null) {
      firstNegativeMonthIndex = monthIndex;
    }

    points.push({
      monthIndex,
      label: createMonthLabel(date),
      income: Number(monthIncome.toFixed(2)),
      expense: Number(monthExpense.toFixed(2)),
      balance: Number(balance.toFixed(2)),
    });
  }

  return {
    points,
    minimumBalance: Number(minimumBalance.toFixed(2)),
    endingBalance: Number(balance.toFixed(2)),
    firstNegativeMonthIndex,
    firstNegativeMonthLabel:
      firstNegativeMonthIndex === null ? null : points[firstNegativeMonthIndex]?.label || null,
  };
}

export function compareTwinScenarios(input) {
  const baselineProjection = projectFinancialTwinScenario({
    ...input,
    modifiers: {},
  });

  const scenarioProjection = projectFinancialTwinScenario(input);

  return {
    baselineProjection,
    scenarioProjection,
    deltaEndingBalance: Number(
      (scenarioProjection.endingBalance - baselineProjection.endingBalance).toFixed(2),
    ),
  };
}

export { calculateAnnuityPayment, normalizeTitle };
