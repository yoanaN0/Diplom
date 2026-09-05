export const periodOptions = [
  { value: "month", label: "Месец" },
  { value: "6months", label: "6 месеца" },
  { value: "year", label: "Година" },
];

export const balanceHistory = {
  week: [
    { label: "Пон", value: 4280 },
    { label: "Вт", value: 4350 },
    { label: "Ср", value: 4410 },
    { label: "Чет", value: 4520 },
    { label: "Пет", value: 4470 },
    { label: "Съб", value: 4685 },
    { label: "Нед", value: 4730 },
  ],
  month: [
    { label: "1", value: 3920 },
    { label: "5", value: 4060 },
    { label: "10", value: 4210 },
    { label: "15", value: 4380 },
    { label: "20", value: 4490 },
    { label: "25", value: 4620 },
    { label: "30", value: 4730 },
  ],
  year: [
    { label: "Яну", value: 3200 },
    { label: "Фев", value: 3420 },
    { label: "Мар", value: 3650 },
    { label: "Апр", value: 3810 },
    { label: "Май", value: 3990 },
    { label: "Юни", value: 4270 },
    { label: "Юли", value: 4730 },
  ],
};

export const periodSummary = {
  week: { income: 980, expense: 620 },
  month: { income: 4280, expense: 2140 },
  year: { income: 50420, expense: 31890 },
};

export const advisorMessages = [
  {
    id: "a-1",
    type: "warning",
    title: "Внимание с ресторантите",
    text: "Остават ти 4 евро от ресторантския бюджет. Помисли за домашен обяд утре.",
  },
  {
    id: "a-2",
    type: "motivation",
    title: "Страхотен ритъм",
    text: "Тази седмица си под бюджета за храна. Продължавай в същия дух.",
  },
];

export function formatEur(value) {
  return new Intl.NumberFormat("bg-BG", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

export function calculateGoalProgress(goal) {
  return Math.min(100, Math.round((goal.saved / goal.target) * 100));
}

export function calculateBudgetUsage(budget) {
  return Math.round((budget.spent / budget.limit) * 100);
}

export function calculateMonthSpendingProjection(
  spentSoFar,
  totalLimit,
  now = new Date(),
  daysElapsed = null,
  daysInMonth = null,
) {
  const resolvedDate = now instanceof Date ? now : new Date(now);
  const safeDaysElapsed = Number.isFinite(daysElapsed)
    ? Number(daysElapsed)
    : resolvedDate.getDate();
  const safeDaysInMonth = Number.isFinite(daysInMonth)
    ? Number(daysInMonth)
    : new Date(resolvedDate.getFullYear(), resolvedDate.getMonth() + 1, 0).getDate();

  if (!Number.isFinite(spentSoFar) || !Number.isFinite(totalLimit) || safeDaysElapsed <= 0) {
    return {
      spentSoFar,
      totalLimit,
      daysElapsed: Math.max(0, safeDaysElapsed),
      daysInMonth: safeDaysInMonth,
      dailyRate: 0,
      projectedTotal: 0,
      projectedOverspend: 0,
      message: "Все още няма достатъчно данни за прогноза",
    };
  }

  const dailyRate = spentSoFar / safeDaysElapsed;
  const projectedTotal = dailyRate * safeDaysInMonth;
  const projectedOverspend = projectedTotal - totalLimit;

  const message =
    projectedOverspend > 0
      ? `При сегашния темп ще надвишиш бюджета с ~${formatEur(projectedOverspend)}.`
      : `При сегашния темп ще останеш в бюджет с ~${formatEur(-projectedOverspend)} резерв.`;

  return {
    spentSoFar,
    totalLimit,
    daysElapsed: safeDaysElapsed,
    daysInMonth: safeDaysInMonth,
    dailyRate,
    projectedTotal,
    projectedOverspend,
    message,
  };
}

export function calculateSpendingPaceIndicator(spentSoFar, totalLimit, daysElapsed, daysInMonth) {
  if (!Number.isFinite(spentSoFar) || !Number.isFinite(totalLimit) || !Number.isFinite(daysElapsed) || !Number.isFinite(daysInMonth)) {
    return { visible: false, emoji: null, label: null, paceRatio: null };
  }

  if (totalLimit <= 0 || daysElapsed < 3 || daysInMonth <= 0) {
    return { visible: false, emoji: null, label: null, paceRatio: null };
  }

  const percentSpent = spentSoFar / totalLimit;
  const percentTimeElapsed = daysElapsed / daysInMonth;

  if (percentTimeElapsed <= 0) {
    return { visible: false, emoji: null, label: null, paceRatio: null };
  }

  const paceRatio = percentSpent / percentTimeElapsed;

  if (paceRatio <= 1.05) {
    return { visible: true, emoji: "🟢", label: "В рамките на бюджета", paceRatio };
  }

  if (paceRatio <= 1.25) {
    return { visible: true, emoji: "🟡", label: "На ръба", paceRatio };
  }

  return { visible: true, emoji: "🔴", label: "Над темпото", paceRatio };
}

export function calculateVariableDailyLimitRecommendation(budgets, now = new Date()) {
  if (!Array.isArray(budgets)) {
    return null;
  }

  const resolvedDate = now instanceof Date ? now : new Date(now);
  const daysInMonth = new Date(resolvedDate.getFullYear(), resolvedDate.getMonth() + 1, 0).getDate();
  const daysElapsed = Math.max(0, resolvedDate.getDate());
  const daysRemaining = Math.max(0, daysInMonth - daysElapsed);

  const variableBudgets = budgets.filter((budget) => {
    const limit = Number(budget?.limit ?? 0);
    const isFixed = Boolean(budget?.isFixed ?? budget?.is_fixed ?? budget?.type === "fixed");
    return Number.isFinite(limit) && limit > 0 && !isFixed;
  });

  if (!variableBudgets.length) {
    return {
      visible: false,
      message: "Няма променливи категории за динамичен дневен лимит.",
      naiveDailyLimit: 0,
      adjustedDailyLimit: 0,
      remainingBudget: 0,
      daysRemaining,
      daysElapsed,
      daysInMonth,
    };
  }

  const variableLimitTotal = variableBudgets.reduce((sum, budget) => sum + Number(budget?.limit ?? 0), 0);
  const variableSpentSoFar = variableBudgets.reduce((sum, budget) => sum + Number(budget?.spent ?? 0), 0);

  const naiveDailyLimit = variableLimitTotal / daysInMonth;
  const expectedSpentByNow = naiveDailyLimit * daysElapsed;
  const overspendSoFar = variableSpentSoFar - expectedSpentByNow;
  const remainingBudget = variableLimitTotal - variableSpentSoFar;

  if (daysRemaining === 0) {
    if (remainingBudget <= 0) {
      return {
        visible: true,
        message: `Вече надвиши бюджета с ${formatEur(Math.abs(remainingBudget))} — остави разходите на пауза до края на месеца, ако е възможно.`,
        naiveDailyLimit,
        adjustedDailyLimit: 0,
        remainingBudget,
        daysRemaining,
        daysElapsed,
        daysInMonth,
      };
    }

    return {
      visible: true,
      message: `Остават ти ${formatEur(remainingBudget)} за днес.`,
      naiveDailyLimit,
      adjustedDailyLimit: remainingBudget,
      remainingBudget,
      daysRemaining,
      daysElapsed,
      daysInMonth,
    };
  }

  const adjustedDailyLimit = remainingBudget / daysRemaining;
  const differenceRatio = naiveDailyLimit > 0 ? Math.abs(adjustedDailyLimit - naiveDailyLimit) / naiveDailyLimit : 0;

  let message;

  if (remainingBudget <= 0) {
    message = `Вече надвиши бюджета с ${formatEur(Math.abs(remainingBudget))} — остави разходите на пауза до края на месеца, ако е възможно.`;
  } else if (adjustedDailyLimit < naiveDailyLimit && differenceRatio > 0.05) {
    message = `За да останеш в бюджет, ограничи се до ~${formatEur(adjustedDailyLimit)}/ден (вместо изчислените ${formatEur(naiveDailyLimit)})/ден, заради по-бързото харчене в началото на месеца.`;
  } else if (adjustedDailyLimit > naiveDailyLimit) {
    message = `Харчиш по-бавно от очакваното — имаш ~${formatEur(adjustedDailyLimit)}/ден на разположение до края на месеца.`;
  } else {
    message = `Точно по план си — продължавай с ~${formatEur(naiveDailyLimit)}/ден.`;
  }

  return {
    visible: true,
    message,
    naiveDailyLimit,
    adjustedDailyLimit,
    remainingBudget,
    overspendSoFar,
    daysRemaining,
    daysElapsed,
    daysInMonth,
  };
}

export function findTopSpendingCategory(budgets, daysElapsed, daysInMonth) {
  if (!Array.isArray(budgets) || !Number.isFinite(daysElapsed) || !Number.isFinite(daysInMonth) || daysInMonth <= 0) {
    return null;
  }

  const validCategories = budgets.filter((budget) => {
    const limit = Number(budget?.limit ?? 0);
    const isFixed = Boolean(budget?.isFixed ?? budget?.is_fixed ?? budget?.type === "fixed");
    return Number.isFinite(limit) && limit > 0 && !isFixed;
  });

  if (!validCategories.length) {
    return null;
  }

  const percentTimeElapsed = daysElapsed / daysInMonth;
  if (percentTimeElapsed <= 0) {
    return null;
  }

  const ranked = validCategories
    .map((budget) => {
      const spent = Number(budget?.spent ?? 0);
      const limit = Number(budget?.limit ?? 0);
      const percentSpent = spent / limit;
      const categoryPaceRatio = percentSpent / percentTimeElapsed;

      return {
        ...budget,
        spent,
        limit,
        percentSpent,
        categoryPaceRatio,
        daysElapsed,
        daysInMonth,
      };
    })
    .sort((left, right) => right.categoryPaceRatio - left.categoryPaceRatio);

  return ranked[0];
}

export function endOfMonthSafeToSpend(totalBudget, totalSpent, now = new Date()) {
  const remaining = Math.max(0, totalBudget - totalSpent);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysLeft = Math.max(1, end.getDate() - now.getDate());
  const perDay = remaining / daysLeft;

  return { remaining, perDay, daysLeft };
}