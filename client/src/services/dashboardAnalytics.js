function toDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function periodBounds(period, now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (period === "week") {
    const start = startOfDay(new Date(now));
    start.setDate(start.getDate() - 6);
    return { start, end, count: 7 };
  }

  if (period === "month") {
    const start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    return { start, end, count: 30 };
  }

  if (period === "6months") {
    const start = startOfDay(new Date(now.getFullYear(), now.getMonth() - 5, 1));
    return { start, end, count: 6 };
  }

  const start = startOfDay(new Date(now.getFullYear(), 0, 1));
  return { start, end, count: 365 };
}

function buildDateSeries(start, count) {
  const dates = [];

  for (let index = 0; index < count; index += 1) {
    const next = new Date(start);
    next.setDate(next.getDate() + index);
    dates.push(next);
  }

  return dates;
}

function formatLabel(date, period) {
  if (period === "week") {
    return new Intl.DateTimeFormat("bg-BG", { weekday: "short" }).format(date);
  }

  if (period === "month") {
    return String(date.getDate());
  }

  if (period === "6months") {
    return new Intl.DateTimeFormat("bg-BG", { month: "short" }).format(date);
  }

  return new Intl.DateTimeFormat("bg-BG", { month: "short" }).format(date);
}

export function calculateCashFlowForMonth(transactions, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  let income = 0;
  let expense = 0;

  (transactions || []).forEach((item) => {
    const date = toDate(item.date);
    if (!date || date < start || date > end) {
      return;
    }

    const amount = Number(item.amount) || 0;

    if (item.type === "income") {
      income += amount;
    } else if (item.type === "expense") {
      expense += amount;
    }
  });

  return {
    income,
    expense,
    maxValue: Math.max(income, expense, 1),
  };
}

export function calculateCashFlowSeries(transactions, period = "month", now = new Date()) {
  const normalized = transactions || [];

  const monthLabel = (date) => new Intl.DateTimeFormat("bg-BG", { month: "short" }).format(date);
  const dayLabel = (date) => new Intl.DateTimeFormat("bg-BG", { day: "numeric", month: "short" }).format(date);

  const buildBuckets = (count, unit) => {
    const labels = [];
    const income = [];
    const expense = [];

    for (let index = 0; index < count; index += 1) {
      let bucketDate;

      if (unit === "month") {
        bucketDate = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
        labels.push(monthLabel(bucketDate));
      } else if (unit === "day") {
        bucketDate = new Date(now.getFullYear(), now.getMonth(), index + 1);
        const step = 5;
        const shouldShowLabel = index === 0 || index === count - 1 || (index + 1) % step === 0;
        labels.push(shouldShowLabel ? dayLabel(bucketDate) : "");
      }

      income.push(0);
      expense.push(0);

      const currentMonth = bucketDate.getMonth();
      const currentYear = bucketDate.getFullYear();
      const targetValue = unit === "month" ? 1 : bucketDate.getDate();

      normalized.forEach((item) => {
        const date = toDate(item.date);
        if (!date) {
          return;
        }

        const amount = Number(item.amount) || 0;

        if (unit === "month") {
          if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
            if (item.type === "income") {
              income[income.length - 1] += amount;
            } else if (item.type === "expense") {
              expense[expense.length - 1] += amount;
            }
          }
          return;
        }

        if (date.getMonth() === currentMonth && date.getFullYear() === currentYear && date.getDate() === targetValue) {
          if (item.type === "income") {
            income[income.length - 1] += amount;
          } else if (item.type === "expense") {
            expense[expense.length - 1] += amount;
          }
        }
      });
    }

    return { labels, income, expense };
  };

  if (period === "month") {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return buildBuckets(daysInMonth, "day");
  }

  if (period === "6months") {
    return buildBuckets(6, "month");
  }

  return buildBuckets(12, "month");
}

export function calculateDashboardData(transactions, goals, budgets, currentBalance, period, now = new Date()) {
  const bounds = periodBounds(period, now);
  const dateSeries = buildDateSeries(bounds.start, bounds.count);

  const filteredTransactions = (transactions || [])
    .map((item) => ({ ...item, amount: Number(item.amount) || 0, date: item.date }))
    .filter((item) => {
      const date = toDate(item.date);
      return date && date >= bounds.start && date <= bounds.end;
    });

  const netByDate = new Map();
  let totalIncome = 0;
  let totalExpense = 0;

  filteredTransactions.forEach((item) => {
    const signedAmount = item.type === "income" ? item.amount : -item.amount;
    const key = startOfDay(toDate(item.date)).toISOString().slice(0, 10);
    netByDate.set(key, (netByDate.get(key) || 0) + signedAmount);

    if (item.type === "income") {
      totalIncome += item.amount;
    } else if (item.type === "expense") {
      totalExpense += item.amount;
    }
  });

  const totalNet = totalIncome - totalExpense;
  let runningBalance = currentBalance - totalNet;

  const history = dateSeries.map((date) => {
    const key = date.toISOString().slice(0, 10);
    runningBalance += netByDate.get(key) || 0;

    return {
      label: formatLabel(date, period),
      value: Number(runningBalance.toFixed(2)),
    };
  });

  const riskyBudgets = (budgets || [])
    .map((budget) => {
      const isFixed = Boolean(budget?.isFixed ?? budget?.is_fixed ?? budget?.type === "fixed");
      return { ...budget, isFixed, usage: Math.round((budget.spent / budget.limit) * 100) };
    })
    .filter((budget) => !budget.isFixed && budget.usage >= 80)
    .sort((left, right) => right.usage - left.usage);

  const goalBubbles = (goals || []).map((goal) => ({
    ...goal,
    progress: Math.min(100, Math.round((goal.saved / goal.target) * 100)),
  }));

  return {
    history,
    summary: {
      income: totalIncome,
      expense: totalExpense,
    },
    riskyBudgets,
    goalBubbles,
    totalBalance: Number(currentBalance.toFixed(2)),
    cashFlow: calculateCashFlowForMonth(transactions, now),
  };
}
