import { useCallback, useEffect, useMemo, useState } from "react";

import { useTransactions } from "../hooks/useTransactions";
import { formatEur } from "../services/financeData";
import {
  buildFinancialTwinBaseline,
  calculateAnnuityPayment,
  compareTwinScenarios,
} from "../services/financialTwin";
import {
  createFinancialTwinScenario,
  deleteFinancialTwinScenario,
  getFinancialTwinScenarios,
  updateFinancialTwinScenario,
} from "../services/financialTwinScenariosApi";
import { getWallets } from "../services/walletsApi";

const initialDraft = {
  horizon: "12",
  enableIncomeChange: false,
  enableOneTimeExpense: false,
  enableOneTimeIncome: false,
  enableLoan: false,
  enableSpendingCut: false,
  incomeAmount: "",
  incomeStart: "0",
  purchaseAmount: "",
  purchaseMonth: "0",
  oneTimeIncomeAmount: "",
  oneTimeIncomeMonth: "0",
  loanPrincipal: "",
  loanRate: "6",
  loanMonths: "24",
  loanStart: "0",
  cutCategories: [],
  cutPercent: "10",
  cutStart: "0",
  cutRules: [],
};

function addMonths(baseDate, offset) {
  return new Date(baseDate.getFullYear(), baseDate.getMonth() + offset, 1);
}

function offsetLabel(offset, startDate) {
  const date = addMonths(startDate, offset + 1);
  const monthLabel = new Intl.DateTimeFormat("bg-BG", {
    month: "long",
    year: "numeric",
  }).format(date);

  if (offset === 0) {
    return `${monthLabel} — следващ месец`;
  }

  return monthLabel;
}

function buildOffsetOptions(horizon, startDate) {
  const end = Math.max(0, horizon - 1);
  const options = [];

  for (let offset = 0; offset <= end; offset += 1) {
    options.push({
      value: String(offset),
      label: offsetLabel(offset, startDate),
    });
  }

  return options;
}

function buildLinePath(points, width, height, min, max, pickValue) {
  if (!points.length) {
    return { path: "", circles: [] };
  }

  const step = points.length > 1 ? width / (points.length - 1) : width;
  const range = Math.max(1, max - min);
  const circles = points.map((point, index) => {
    const x = index * step;
    const y = height - ((pickValue(point) - min) / range) * height;
    return { x, y, point };
  });

  const path = circles
    .map((coord, index) => `${index === 0 ? "M" : "L"}${coord.x},${coord.y}`)
    .join(" ");

  return { path, circles };
}

function metricTone(value) {
  if (value < 0) {
    return "pill pill--danger";
  }

  if (value < 200) {
    return "pill pill--warn";
  }

  return "pill pill--ok";
}

function scenarioCardClass(kind, enabled) {
  return `twin-scenario-card twin-scenario-card--${kind}${enabled ? " twin-scenario-card--active" : ""}`;
}

function normalizeSavedDraft(rawDraft) {
  const source = rawDraft && typeof rawDraft === "object" ? rawDraft : {};
  const horizon = Math.max(1, Number(source.horizon) || 12);
  const maxOffset = horizon - 1;
  const cutCategories = Array.isArray(source.cutCategories)
    ? source.cutCategories.filter(Boolean)
    : [];

  const clampMonth = (value) => {
    const monthValue = Number(value);
    if (!Number.isFinite(monthValue)) {
      return "0";
    }

    return String(Math.max(0, Math.min(monthValue, maxOffset)));
  };

  return {
    ...initialDraft,
    ...source,
    horizon: String(horizon),
    enableIncomeChange: Boolean(source.enableIncomeChange),
    enableOneTimeExpense: Boolean(source.enableOneTimeExpense),
    enableOneTimeIncome: Boolean(source.enableOneTimeIncome),
    enableLoan: Boolean(source.enableLoan),
    enableSpendingCut: Boolean(source.enableSpendingCut),
    incomeStart: clampMonth(source.incomeStart),
    purchaseMonth: clampMonth(source.purchaseMonth),
    oneTimeIncomeMonth: clampMonth(source.oneTimeIncomeMonth),
    loanStart: clampMonth(source.loanStart),
    cutStart: clampMonth(source.cutStart),
    cutCategories,
    cutRules: Array.isArray(source.cutRules)
      ? source.cutRules
          .filter((rule) => rule && typeof rule === "object")
          .map((rule) => {
            const start = Number(clampMonth(rule.startMonth));
            const rawEndMonth = rule.endMonth;
            const endMonthValue = rawEndMonth === "" || rawEndMonth === null || rawEndMonth === undefined
              ? ""
              : clampMonth(rawEndMonth);
            const finalEnd = endMonthValue !== "" && Number(endMonthValue) < start ? "" : endMonthValue;

            return {
              category: String(rule.category || "").trim(),
              percent: String(rule.percent ?? source.cutPercent ?? "10"),
              startMonth: String(start),
              endMonth: finalEnd,
            };
          })
          .filter((rule) => rule.category !== "")
      : [],
  };
}

function normalizeCategoryName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\-_]+/g, " ")
    .replace(/[^a-zа-я0-9 ]/gi, "")
    .replace(/\s+/g, " ");
}

function buildRecurringExpenseItems(baseline) {
  const grouped = new Map();

  const addEntry = (entry, kind) => {
    const rawCategory = String(entry?.category || "Други").trim();
    const categoryName = normalizeCategoryName(rawCategory) || "други";
    const current = grouped.get(categoryName) || {
      key: categoryName,
      title: rawCategory || "Други",
      category: rawCategory || "Други",
      amount: 0,
      confidenceWeighted: 0,
      confidenceWeight: 0,
    };

    const amount = Number(entry?.amount) || 0;
    const confidence = Number(entry?.confidence) || 0;
    current.amount += amount;
    current.confidenceWeighted += amount * confidence;
    current.confidenceWeight += amount;

    if (kind === "recurring" && current.title === "Други") {
      current.title = rawCategory || "Други";
    }

    grouped.set(categoryName, current);
  };

  (baseline?.recurringExpenses || []).forEach((item) => addEntry(item, "recurring"));
  (baseline?.variableExpenses || []).forEach((item) => addEntry(item, "variable"));

  return Array.from(grouped.values())
    .map((item) => ({
      key: item.key,
      title: item.title,
      category: item.category,
      amount: Number(item.amount.toFixed(2)),
      confidence: item.confidenceWeight > 0
        ? Number((item.confidenceWeighted / item.confidenceWeight).toFixed(2))
        : 0,
    }))
    .sort((left, right) => right.amount - left.amount);
}

function FinancialTwin() {
  const { transactions, loading, error } = useTransactions();
  const [draft, setDraft] = useState(initialDraft);
  const [projectionReferenceDate] = useState(() => new Date());
  const [wallets, setWallets] = useState([]);
  const [savedScenarios, setSavedScenarios] = useState([]);
  const [scenarioName, setScenarioName] = useState("");
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [scenariosLoading, setScenariosLoading] = useState(true);
  const [scenariosError, setScenariosError] = useState("");
  const [scenarioActionError, setScenarioActionError] = useState("");
  const [scenarioActionMessage, setScenarioActionMessage] = useState("");
  const [scenarioActionBusy, setScenarioActionBusy] = useState(false);
  const [isRecurringSectionCollapsed, setIsRecurringSectionCollapsed] = useState(true);
  const [collapsedCutCategories, setCollapsedCutCategories] = useState([]);
  const [walletsLoading, setWalletsLoading] = useState(true);
  const [walletsError, setWalletsError] = useState("");

  const loadScenarios = useCallback(async (preferredScenarioId = "", showLoading = false) => {
    if (showLoading) {
      setScenariosLoading(true);
      setScenariosError("");
    }

    try {
      const scenarios = await getFinancialTwinScenarios();
      setSavedScenarios(scenarios);

      if (preferredScenarioId) {
        const match = scenarios.find((item) => String(item.id) === String(preferredScenarioId));

        if (match) {
          setSelectedScenarioId(String(match.id));
          setScenarioName(match.name || "");
        }
      } else if (!scenarios.length) {
        setSelectedScenarioId("");
      }
    } catch {
      setScenariosError("Неуспешно зареждане на запазените сценарии.");
    } finally {
      setScenariosLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadWallets = async () => {
      setWalletsLoading(true);
      setWalletsError("");

      try {
        setWallets(await getWallets());
      } catch {
        setWalletsError("Неуспешно зареждане на портфейлите.");
      } finally {
        setWalletsLoading(false);
      }
    };

    void loadWallets();
  }, []);

  useEffect(() => {
    const loadInitialScenarios = async () => {
      setScenariosLoading(true);
      setScenariosError("");

      try {
        const scenarios = await getFinancialTwinScenarios();
        setSavedScenarios(scenarios);
        if (!scenarios.length) {
          setSelectedScenarioId("");
        }
      } catch {
        setScenariosError("Неуспешно зареждане на запазените сценарии.");
      } finally {
        setScenariosLoading(false);
      }
    };

    void loadInitialScenarios();
  }, []);

  const currentBalance = useMemo(
    () => wallets.reduce((sum, wallet) => sum + (wallet.isActive ? Number(wallet.balance) || 0 : 0), 0),
    [wallets],
  );

  const baseline = useMemo(() => {
    return buildFinancialTwinBaseline(transactions);
  }, [transactions]);

  const variableCategories = useMemo(() => {
    return baseline.variableExpenses.map((item) => item.category);
  }, [baseline]);

  const recurringExpenseItems = useMemo(() => {
    return buildRecurringExpenseItems(baseline);
  }, [baseline]);

  const horizonMonths = Math.max(1, Number(draft.horizon) || 12);

  const offsetOptions = useMemo(() => {
    return buildOffsetOptions(horizonMonths, projectionReferenceDate);
  }, [horizonMonths, projectionReferenceDate]);

  const updateHorizon = (value) => {
    const nextHorizon = Math.max(1, Number(value) || 12);
    const maxOffset = nextHorizon - 1;

    const clampMonth = (itemValue) => {
      const monthValue = Number(itemValue);
      if (!Number.isFinite(monthValue)) {
        return "0";
      }

      return String(Math.max(0, Math.min(monthValue, maxOffset)));
    };

    setDraft((current) => {
      const nextCutRules = (Array.isArray(current.cutRules) ? current.cutRules : []).map((rule) => {
        const start = clampMonth(rule.startMonth);
        const rawEnd = rule.endMonth;
        const end = rawEnd === "" || rawEnd === null || rawEnd === undefined
          ? ""
          : clampMonth(rawEnd);
        const normalizedEnd = end !== "" && Number(start) > Number(end) ? "" : end;

        return {
          ...rule,
          startMonth: start,
          endMonth: normalizedEnd,
        };
      });

      return {
        ...current,
        horizon: String(nextHorizon),
        incomeStart: clampMonth(current.incomeStart),
        purchaseMonth: clampMonth(current.purchaseMonth),
        oneTimeIncomeMonth: clampMonth(current.oneTimeIncomeMonth),
        loanStart: clampMonth(current.loanStart),
        cutStart: clampMonth(current.cutStart),
        cutRules: nextCutRules,
      };
    });
  };

  const updateCutRule = (category, updates) => {
    setDraft((current) => {
      const currentRules = Array.isArray(current.cutRules) ? current.cutRules : [];
      const existingRule = currentRules.find((rule) => rule.category === category);
      const baseRule = {
        category,
        percent: current.cutPercent || "10",
        startMonth: current.cutStart || "0",
        endMonth: "",
        ...(existingRule || {}),
        ...updates,
      };

      const startValue = Number.isFinite(Number(baseRule.startMonth)) ? Number(baseRule.startMonth) : 0;
      const endValueRaw = baseRule.endMonth;
      const endValue = endValueRaw === "" || endValueRaw === null || endValueRaw === undefined
        ? ""
        : Number(endValueRaw);
      const normalizedEnd = Number.isFinite(endValue) && endValue < startValue ? "" :
        (Number.isFinite(endValue) ? String(endValue) : "");

      const nextRule = {
        ...baseRule,
        startMonth: String(startValue),
        endMonth: normalizedEnd,
      };

      const nextRules = existingRule
        ? currentRules.map((rule) => (rule.category === category ? nextRule : rule))
        : [...currentRules, nextRule];

      return {
        ...current,
        cutRules: nextRules,
      };
    });
  };

  const applyCutRuleToAllSelectedCategories = () => {
    setDraft((current) => {
      const selectedCategories = Array.isArray(current.cutCategories)
        ? current.cutCategories.filter(Boolean)
        : [];

      if (selectedCategories.length <= 1) {
        return current;
      }

      const baseRule = (current.cutRules || []).find((rule) => rule.category === selectedCategories[0]) || {
        category: selectedCategories[0],
        percent: current.cutPercent || "10",
        startMonth: current.cutStart || "0",
        endMonth: "",
      };

      const preservedRules = (current.cutRules || []).filter(
        (rule) => !selectedCategories.includes(rule.category),
      );

      const nextRules = [
        ...preservedRules,
        ...selectedCategories.map((category) => ({
          category,
          percent: baseRule.percent ?? current.cutPercent ?? "10",
          startMonth: baseRule.startMonth ?? current.cutStart ?? "0",
          endMonth: baseRule.endMonth ?? "",
        })),
      ];

      return {
        ...current,
        cutRules: nextRules,
      };
    });
  };

  const toggleCutCategoryCollapsed = (category) => {
    setCollapsedCutCategories((current) => {
      if (current.includes(category)) {
        return current.filter((item) => item !== category);
      }

      return [...current, category];
    });
  };

  const scenarioModifiers = useMemo(() => {
    const incomeAmount = Number(draft.incomeAmount);
    const purchaseAmount = Number(draft.purchaseAmount);
    const loanPrincipal = Number(draft.loanPrincipal);
    const cutPercent = Number(draft.cutPercent);
    const cutCategories = Array.isArray(draft.cutCategories)
      ? draft.cutCategories.filter(Boolean)
      : draft.cutCategories
        ? [draft.cutCategories]
        : [];
    const spendingCuts = cutCategories.map((category) => {
      const storedRule = (draft.cutRules || []).find((rule) => rule.category === category);
      const percentValue = Number.isFinite(Number(storedRule?.percent))
        ? Number(storedRule.percent)
        : cutPercent;
      const startMonthValue = Number.isFinite(Number(storedRule?.startMonth))
        ? Number(storedRule.startMonth)
        : Number(draft.cutStart) || 0;
      const rawEndMonth = storedRule?.endMonth;
      const endMonthValue = rawEndMonth === "" || rawEndMonth === null || rawEndMonth === undefined
        ? undefined
        : Number(rawEndMonth);

      return {
        category,
        percent: percentValue,
        startMonth: startMonthValue,
        ...(endMonthValue !== undefined ? { endMonth: endMonthValue } : {}),
      };
    });

    return {
      incomeChange:
        draft.enableIncomeChange && Number.isFinite(incomeAmount) && incomeAmount !== 0
          ? {
              amount: incomeAmount,
              startMonth: Number(draft.incomeStart) || 0,
            }
          : undefined,
      oneTimeExpense:
        draft.enableOneTimeExpense && Number.isFinite(purchaseAmount) && purchaseAmount > 0
          ? {
              amount: purchaseAmount,
              month: Number(draft.purchaseMonth) || 0,
            }
          : undefined,
      oneTimeIncome:
        draft.enableOneTimeIncome && Number.isFinite(Number(draft.oneTimeIncomeAmount)) && Number(draft.oneTimeIncomeAmount) > 0
          ? {
              amount: Number(draft.oneTimeIncomeAmount),
              month: Number(draft.oneTimeIncomeMonth) || 0,
            }
          : undefined,
      loan:
        draft.enableLoan && Number.isFinite(loanPrincipal) && loanPrincipal > 0
          ? {
              principal: loanPrincipal,
              annualRate: Number(draft.loanRate) || 0,
              months: Number(draft.loanMonths) || 1,
              startMonth: Number(draft.loanStart) || 0,
            }
          : undefined,
      spendingCuts: spendingCuts.length > 0 ? spendingCuts : undefined,
    };
  }, [draft]);

  const selectedScenario = useMemo(
    () => savedScenarios.find((item) => String(item.id) === String(selectedScenarioId)) || null,
    [savedScenarios, selectedScenarioId],
  );

  const applySavedScenario = useCallback(
    (scenario) => {
      if (!scenario) {
        return;
      }

      const fallbackDraft = {
        ...initialDraft,
        horizon: String(scenario.horizonMonths || 12),
      };
      const nextDraft = normalizeSavedDraft(
        scenario.draft && Object.keys(scenario.draft).length > 0
          ? scenario.draft
          : fallbackDraft,
      );

      setDraft(nextDraft);
      setCollapsedCutCategories([]);
      setSelectedScenarioId(String(scenario.id));
      setScenarioName(scenario.name || "");
      setScenarioActionError("");
      setScenarioActionMessage("Сценарият е зареден.");
    },
    [],
  );

  const buildScenarioName = () => {
    const trimmed = scenarioName.trim();
    if (trimmed !== "") {
      return trimmed;
    }

    const suffix = new Intl.DateTimeFormat("bg-BG", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());

    return `Сценарий ${suffix}`;
  };

  const handleSaveScenario = async () => {
    setScenarioActionBusy(true);
    setScenarioActionError("");
    setScenarioActionMessage("");

    try {
      const created = await createFinancialTwinScenario({
        name: buildScenarioName(),
        horizonMonths,
        draft,
        modifiers: scenarioModifiers,
      });

      await loadScenarios(created.id, true);
      setScenarioActionMessage("Сценарият е запазен.");
    } catch {
      setScenarioActionError("Неуспешно запазване на сценария.");
    } finally {
      setScenarioActionBusy(false);
    }
  };

  const handleUpdateScenario = async () => {
    if (!selectedScenario) {
      setScenarioActionError("Избери сценарий, който да обновиш.");
      return;
    }

    setScenarioActionBusy(true);
    setScenarioActionError("");
    setScenarioActionMessage("");

    try {
      const updated = await updateFinancialTwinScenario({
        id: selectedScenario.id,
        name: buildScenarioName(),
        horizonMonths,
        draft,
        modifiers: scenarioModifiers,
      });

      await loadScenarios(updated.id, true);
      setScenarioActionMessage("Сценарият е обновен.");
    } catch {
      setScenarioActionError("Неуспешно обновяване на сценария.");
    } finally {
      setScenarioActionBusy(false);
    }
  };

  const handleDeleteScenario = async () => {
    if (!selectedScenario) {
      setScenarioActionError("Избери сценарий за изтриване.");
      return;
    }

    const confirmDelete = window.confirm(`Сигурен/а ли си, че искаш да изтриеш "${selectedScenario.name}"?`);
    if (!confirmDelete) {
      return;
    }

    setScenarioActionBusy(true);
    setScenarioActionError("");
    setScenarioActionMessage("");

    try {
      await deleteFinancialTwinScenario(selectedScenario.id);
      await loadScenarios("", true);
      setSelectedScenarioId("");
      setScenarioActionMessage("Сценарият е изтрит.");
    } catch {
      setScenarioActionError("Неуспешно изтриване на сценария.");
    } finally {
      setScenarioActionBusy(false);
    }
  };

  const comparison = useMemo(() => {
    return compareTwinScenarios({
      startBalance: currentBalance,
      baseline,
      months: horizonMonths,
      startDate: projectionReferenceDate,
      modifiers: scenarioModifiers,
    });
  }, [baseline, currentBalance, horizonMonths, projectionReferenceDate, scenarioModifiers]);

  const insufficientHistory = baseline?.insufficientHistory === true;

  const chartModel = useMemo(() => {
    const baselinePoints = comparison.baselineProjection.points;
    const scenarioPoints = comparison.scenarioProjection.points;
    const allValues = [
      ...baselinePoints.map((item) => item.balance),
      ...scenarioPoints.map((item) => item.balance),
    ];

    const rawMin = Math.min(...allValues, 0);
    const rawMax = Math.max(...allValues, currentBalance);
    const pad = Math.max(1, (rawMax - rawMin) * 0.05);
    const min = rawMin - pad;
    const max = rawMax + pad;

    return {
      baseline: buildLinePath(baselinePoints, 760, 290, min, max, (item) => item.balance),
      scenario: buildLinePath(scenarioPoints, 760, 290, min, max, (item) => item.balance),
      labels: baselinePoints.map((item) => item.label),
    };
  }, [comparison, currentBalance]);

  const scenarioMinimum = comparison.scenarioProjection.minimumBalance;
  const baselineMinimum = comparison.baselineProjection.minimumBalance;
  const isLoading = loading || walletsLoading;
  const displayError = error || walletsError;

  const cutStartMarkers = useMemo(() => {
    if (!draft.enableSpendingCut || !(draft.cutCategories || []).length) {
      return [];
    }

    const categories = draft.cutCategories.filter(Boolean);
    const baselineCircles = chartModel.baseline.circles;
    const n = baselineCircles.length;
    const width = 760;
    const step = n > 1 ? width / (n - 1) : width;
    const colors = ["#f97316", "#0ea5e9", "#8b5cf6", "#ec4899", "#84cc16"];

    return categories.map((category, index) => {
      const rule = (draft.cutRules || []).find((item) => item.category === category);
      const startMonth = Number.isFinite(Number(rule?.startMonth))
        ? Number(rule.startMonth)
        : Number(draft.cutStart) || 0;
      const x = n > 1 ? Math.min(width, Math.max(0, startMonth * step)) : 0;

      return {
        category,
        startMonth,
        x,
        color: colors[index % colors.length],
      };
    });
  }, [chartModel.baseline.circles, draft.cutCategories, draft.cutRules, draft.cutStart, draft.enableSpendingCut]);

  const scenarioBreakdown = useMemo(() => {
    const lines = [];

    if (scenarioModifiers.oneTimeExpense) {
      lines.push(
        `Еднократна покупка: -${formatEur(scenarioModifiers.oneTimeExpense.amount)} · ${offsetLabel(
          scenarioModifiers.oneTimeExpense.month,
          projectionReferenceDate,
        )}`,
      );
    }

    if (scenarioModifiers.oneTimeIncome) {
      lines.push(
        `Еднократен доход: +${formatEur(scenarioModifiers.oneTimeIncome.amount)} · ${offsetLabel(
          scenarioModifiers.oneTimeIncome.month,
          projectionReferenceDate,
        )}`,
      );
    }

    if (scenarioModifiers.spendingCuts?.length) {
      const summary = scenarioModifiers.spendingCuts
        .map((rule) => {
          const range = rule.endMonth !== undefined ? ` · ${rule.startMonth}-${rule.endMonth}` : "";
          return `${rule.category} ${rule.percent}%${range}`;
        })
        .join(" | ");

      lines.push(`Намаляване по категории: ${summary}`);
    } else if (scenarioModifiers.spendingCut) {
      const selectedCategories = scenarioModifiers.spendingCut.categories || [];
      const baselineAmount = selectedCategories.reduce((sum, category) => {
        const baselineCategory = baseline.variableExpenses.find((item) => item.category === category);
        return sum + (baselineCategory?.amount || 0);
      }, 0);
      const savedPerMonth = baselineAmount * (scenarioModifiers.spendingCut.percent / 100);
      const categoryLabel = selectedCategories.join(", ");

      lines.push(
        `Намаляване ${categoryLabel}: +${formatEur(savedPerMonth)} / месец (${scenarioModifiers.spendingCut.percent}%) · ${offsetLabel(
          scenarioModifiers.spendingCut.startMonth,
          projectionReferenceDate,
        )}`,
      );
    }

    if (scenarioModifiers.incomeChange) {
      const sign = scenarioModifiers.incomeChange.amount > 0 ? "+" : "";
      lines.push(
        `Промяна в доход: ${sign}${formatEur(scenarioModifiers.incomeChange.amount)} / месец · ${offsetLabel(
          scenarioModifiers.incomeChange.startMonth,
          projectionReferenceDate,
        )}`,
      );
    }

    if (scenarioModifiers.loan) {
      const payment = calculateAnnuityPayment(
        scenarioModifiers.loan.principal,
        scenarioModifiers.loan.annualRate,
        scenarioModifiers.loan.months,
      );

      lines.push(
        `Кредит: +${formatEur(scenarioModifiers.loan.principal)} еднократно · -${formatEur(payment)} / месец за ${scenarioModifiers.loan.months} месеца · ${offsetLabel(
          scenarioModifiers.loan.startMonth,
          projectionReferenceDate,
        )}`,
      );
    }

    return lines;
  }, [baseline.variableExpenses, projectionReferenceDate, scenarioModifiers]);

  return (
    <div className="finance-page twin-page">
      <section className="finance-header">
        <div>
          <h1>Сценарии</h1>
          <p>
            Сравнявай базовата прогноза с "Какво ако" сценарии за следващите
            1-24 месеца, без да променяш реалните си данни.
          </p>
        </div>
      </section>

      <section className="twin-layout">
        <article className="surface-card">
          <div className="surface-card__head">
            <h2>Симулационен панел</h2>
            <span className="muted">Текущ баланс: {formatEur(currentBalance)}</span>
          </div>

          <div className="twin-base-controls">
            <label>
              <span>Хоризонт (месеци)</span>
              <select
                value={draft.horizon}
                onChange={(event) => updateHorizon(event.target.value)}
              >
                {[1, 3, 6, 12, 18, 24].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>

          <section className="twin-saved-scenarios" style={{ marginBottom: "1rem", padding: "0.9rem" }}>
            <div className="surface-card__head" style={{ marginBottom: "0.6rem" }}>
              <h3 style={{ margin: 0 }}>Запази сценарий</h3>
              <span className="muted">Въведи име и запази текущата конфигурация.</span>
            </div>

            <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "minmax(220px, 1fr) auto" }}>
              <label>
                <span>Име на сценария</span>
                <input
                  type="text"
                  value={scenarioName}
                  onChange={(event) => setScenarioName(event.target.value)}
                  placeholder="напр. Лаптоп + фрийланс"
                  maxLength={120}
                />
              </label>

              <button
                type="button"
                className="twin-action-btn twin-action-btn--save"
                onClick={handleSaveScenario}
                disabled={scenarioActionBusy}
                style={{ alignSelf: "end" }}
              >
                Запази сценарий
              </button>
            </div>
          </section>

          <div className="muted" style={{ marginBottom: "1rem", lineHeight: 1.5 }}>
            Избери какъв разход искаш да прецениш и как можеш да го компенсираш — с допълнителен доход, с намаляване на текущи разходи или с кредит.
          </div>

          <div className="twin-scenarios-grid" style={{ gap: "1rem" }}>
            <article className="surface-card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div>
                <h3 style={{ margin: "0 0 0.35rem" }}>Какъв разход искаш да прецениш?</h3>
                <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
                  Посочи еднократния разход, който искаш да прецениш, и кога ще се появи.
                </p>
              </div>

              <article className={scenarioCardClass("purchase", draft.enableOneTimeExpense)}>
                <label className="twin-toggle">
                  <input
                    type="checkbox"
                    checked={draft.enableOneTimeExpense}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        enableOneTimeExpense: event.target.checked,
                      }))
                    }
                  />
                  <strong>Еднократен разход</strong>
                </label>

                <fieldset disabled={!draft.enableOneTimeExpense}>
                  <label>
                    <span>Сума на разхода</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={draft.purchaseAmount}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, purchaseAmount: event.target.value }))
                      }
                      placeholder="напр. 1200"
                    />
                  </label>

                  <label>
                    <span>Кога ще се случи?</span>
                    <select
                      value={draft.purchaseMonth}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, purchaseMonth: event.target.value }))
                      }
                    >
                      {offsetOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </fieldset>
              </article>
            </article>

            <article className="surface-card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div>
                <h3 style={{ margin: "0 0 0.35rem" }}>Метод за компенсиране на разхода</h3>
                <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
                  Избери как можеш да компенсираш разхода — с допълнителен доход, с намаляване на разходи или с кредит.
                </p>
              </div>

              <div className="twin-scenarios-grid" style={{ gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
                <article className={scenarioCardClass("income", draft.enableIncomeChange)}>
                  <label className="twin-toggle">
                    <input
                      type="checkbox"
                      checked={draft.enableIncomeChange}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          enableIncomeChange: event.target.checked,
                        }))
                      }
                    />
                    <strong>Компенсация с доход</strong>
                  </label>

                  <fieldset disabled={!draft.enableIncomeChange}>
                    <label>
                      <span>Сума на дохода</span>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          marginTop: "0.35rem",
                          border: "1px solid #cbd5e1",
                          borderRadius: "0.65rem",
                          padding: "0.5rem 0.65rem",
                          background: "#fff",
                        }}
                      >
                        <span style={{ fontWeight: 700, color: "#0f766e" }}>±</span>
                        <input
                          type="number"
                          step="0.01"
                          value={draft.incomeAmount}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, incomeAmount: event.target.value }))
                          }
                          placeholder="напр. 250"
                          style={{ border: "none", outline: "none", padding: 0, width: "100%" }}
                        />
                        <span className="muted" style={{ fontSize: "0.9rem", whiteSpace: "nowrap" }}>
                          €/месец
                        </span>
                      </div>
                    </label>

                    <label>
                      <span>От кога да влияе?</span>
                      <select
                        value={draft.incomeStart}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, incomeStart: event.target.value }))
                        }
                      >
                        {offsetOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>

                    <article className={scenarioCardClass("one-time-income", draft.enableOneTimeIncome)} style={{ marginTop: "0.75rem" }}>
                      <label className="twin-toggle">
                        <input
                          type="checkbox"
                          checked={draft.enableOneTimeIncome}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              enableOneTimeIncome: event.target.checked,
                            }))
                          }
                        />
                        <strong>Еднократен доход</strong>
                      </label>

                      <fieldset disabled={!draft.enableOneTimeIncome}>
                        <label>
                          <span>Сума на еднократния доход</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={draft.oneTimeIncomeAmount}
                            onChange={(event) =>
                              setDraft((current) => ({ ...current, oneTimeIncomeAmount: event.target.value }))
                            }
                            placeholder="напр. 1000"
                          />
                        </label>

                        <label>
                          <span>Кога да се появи?</span>
                          <select
                            value={draft.oneTimeIncomeMonth}
                            onChange={(event) =>
                              setDraft((current) => ({ ...current, oneTimeIncomeMonth: event.target.value }))
                            }
                          >
                            {offsetOptions.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                      </fieldset>
                    </article>
                  </fieldset>
                </article>

                <article className={scenarioCardClass("cut", draft.enableSpendingCut)}>
                  <label className="twin-toggle">
                    <input
                      type="checkbox"
                      checked={draft.enableSpendingCut}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          enableSpendingCut: event.target.checked,
                        }))
                      }
                    />
                    <strong>Компенсация с намаляване на разход</strong>
                  </label>

                  <fieldset disabled={!draft.enableSpendingCut}>
                    <label>
                      <span>Избери категории за намаляване</span>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.5rem",
                          marginTop: "0.4rem",
                        }}
                      >
                        {variableCategories.length > 0 ? (
                          variableCategories.map((category) => {
                            const checked = (draft.cutCategories || []).includes(category);

                            return (
                              <label
                                key={category}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.35rem",
                                  padding: "0.35rem 0.6rem",
                                  border: "1px solid #cbd5e1",
                                  borderRadius: "999px",
                                  fontSize: "0.95rem",
                                  background: checked ? "#ecfeff" : "#fff",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setDraft((current) => {
                                      const currentCategories = Array.isArray(current.cutCategories)
                                        ? current.cutCategories
                                        : [];
                                      const nextCategories = currentCategories.includes(category)
                                        ? currentCategories.filter((item) => item !== category)
                                        : [...currentCategories, category];

                                      return {
                                        ...current,
                                        cutCategories: nextCategories,
                                      };
                                    })
                                  }
                                />
                                <span>{category}</span>
                              </label>
                            );
                          })
                        ) : (
                          <span className="muted">Няма налични категории за намаляване.</span>
                        )}
                      </div>
                    </label>

                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      {draft.cutCategories.length > 1 && (
                        <button
                          type="button"
                          onClick={applyCutRuleToAllSelectedCategories}
                          style={{
                            alignSelf: "flex-start",
                            border: "1px solid #0f766e",
                            background: "#14b8a6",
                            color: "#fff",
                            borderRadius: "0.5rem",
                            padding: "0.45rem 0.7rem",
                            cursor: "pointer",
                          }}
                        >
                          Приложи същото правило към всички избрани
                        </button>
                      )}

                      {draft.cutCategories.length > 0 ? (
                        draft.cutCategories.map((category) => {
                          const rule = (draft.cutRules || []).find((item) => item.category === category) || {
                            category,
                            percent: draft.cutPercent,
                            startMonth: draft.cutStart,
                            endMonth: "",
                          };

                          const isCollapsed = collapsedCutCategories.includes(category);

                          return (
                            <div
                              key={category}
                              style={{
                                border: "1px solid #e2e8f0",
                                borderRadius: "0.75rem",
                                padding: "0.75rem",
                                background: "#f8fafc",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: "0.5rem",
                                  marginBottom: isCollapsed ? 0 : "0.5rem",
                                }}
                              >
                                <div style={{ fontWeight: 600 }}>{category}</div>
                                <button
                                  type="button"
                                  onClick={() => toggleCutCategoryCollapsed(category)}
                                  style={{
                                    border: "none",
                                    background: "transparent",
                                    color: "#0f766e",
                                    cursor: "pointer",
                                    fontSize: "0.95rem",
                                    padding: 0,
                                  }}
                                >
                                  {isCollapsed ? "Покажи" : "Скрий"}
                                </button>
                              </div>

                              {!isCollapsed && (
                                <>
                                  <label style={{ marginBottom: "0.5rem" }}>
                                    <span>Процент намаляване</span>
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={rule.percent}
                                      onChange={(event) =>
                                        updateCutRule(category, { percent: event.target.value })
                                      }
                                    />
                                  </label>

                                  <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
                                    <label>
                                      <span>От месец</span>
                                      <select
                                        value={String(rule.startMonth ?? "0")}
                                        onChange={(event) =>
                                          updateCutRule(category, { startMonth: event.target.value })
                                        }
                                      >
                                        {offsetOptions.map((option) => (
                                          <option key={option.value} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>

                                    <label>
                                      <span>До месец</span>
                                      <select
                                        value={rule.endMonth === "" ? "" : String(rule.endMonth ?? "")}
                                        onChange={(event) =>
                                          updateCutRule(category, { endMonth: event.target.value })
                                        }
                                      >
                                        <option value="">До края на прогнозата</option>
                                        {offsetOptions
                                          .filter((option) => Number(option.value) >= Number(rule.startMonth ?? 0))
                                          .map((option) => (
                                            <option key={option.value} value={option.value}>
                                              {option.label}
                                            </option>
                                          ))}
                                      </select>
                                    </label>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <span className="muted">Избери категории, за да настроиш отделни правила.</span>
                      )}
                    </div>
                  </fieldset>
                </article>

                <article className={scenarioCardClass("loan", draft.enableLoan)}>
                  <label className="twin-toggle">
                    <input
                      type="checkbox"
                      checked={draft.enableLoan}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          enableLoan: event.target.checked,
                        }))
                      }
                    />
                    <strong>Компенсация с кредит</strong>
                  </label>

                  <fieldset disabled={!draft.enableLoan}>
                    <label>
                      <span>Сума на кредита</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.loanPrincipal}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, loanPrincipal: event.target.value }))
                        }
                        placeholder="напр. 5000"
                      />
                    </label>

                    <label>
                      <span>Годишна лихва (%)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.loanRate}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, loanRate: event.target.value }))
                        }
                      />
                    </label>

                    <label>
                      <span>Срок (месеци)</span>
                      <input
                        type="number"
                        min="1"
                        value={draft.loanMonths}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, loanMonths: event.target.value }))
                        }
                      />
                    </label>

                    <label>
                      <span>Старт на кредита</span>
                      <select
                        value={draft.loanStart}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, loanStart: event.target.value }))
                        }
                      >
                        {offsetOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  </fieldset>
                </article>
              </div>
            </article>
          </div>
        </article>

        <aside className="twin-metrics-grid">
          <article className="surface-card widget-card">
            <span>Разлика в края на периода</span>
            <strong>{formatEur(comparison.deltaEndingBalance)}</strong>
          </article>

          <article className="surface-card widget-card">
            <span>Минимален баланс (база)</span>
            <strong>{formatEur(baselineMinimum)}</strong>
            <span className={metricTone(baselineMinimum)}>
              {comparison.baselineProjection.firstNegativeMonthLabel
                ? `Първи минус: ${comparison.baselineProjection.firstNegativeMonthLabel}`
                : "Няма минус"}
            </span>
          </article>

          <article className="surface-card widget-card">
            <span>Минимален баланс (сценарий)</span>
            <strong>{formatEur(scenarioMinimum)}</strong>
            <span className={metricTone(scenarioMinimum)}>
              {comparison.scenarioProjection.firstNegativeMonthLabel
                ? `Първи минус: ${comparison.scenarioProjection.firstNegativeMonthLabel}`
                : "Няма минус"}
            </span>
          </article>
        </aside>
      </section>

      <section className="surface-card twin-chart-card">
        <div className="surface-card__head">
          <h2>Сравнение на сценарии</h2>
          <div className="twin-chart-legend" aria-label="Легенда">
            <span><i className="legend-dot legend-dot--baseline" /> Базова линия</span>
            <span><i className="legend-dot legend-dot--scenario" /> Сценарий</span>
          </div>
        </div>

        {isLoading ? <p className="muted">Зареждане на данни...</p> : null}
        {displayError ? <p className="muted">{displayError}</p> : null}
        {!isLoading && !displayError && insufficientHistory ? (
          <p className="muted" style={{ marginBottom: "1rem" }}>
            Все още няма достатъчно исторически данни за надеждна базова прогноза. Необходими са поне два завършени месеца.
          </p>
        ) : null}

        {!isLoading && !displayError ? (
          <>
            <svg className="twin-chart" viewBox="0 0 760 320" role="img" aria-label="Прогнозен баланс">
              <path
                d={chartModel.baseline.path}
                fill="none"
                stroke="rgba(15, 23, 42, 0.55)"
                strokeWidth="3"
                strokeDasharray="7 8"
                strokeLinecap="round"
              />
              <path
                d={chartModel.scenario.path}
                fill="none"
                stroke="#0f766e"
                strokeWidth="4"
                strokeLinecap="round"
              />

              {chartModel.scenario.circles.map((coord, index) => (
                <circle
                  key={`scenario-${coord.point.monthIndex}`}
                  cx={coord.x}
                  cy={coord.y}
                  r={index === chartModel.scenario.circles.length - 1 ? 6 : 3.5}
                  fill="#0f766e"
                />
              ))}

              {cutStartMarkers.map((marker, index) => (
                <g key={`${marker.category}-${marker.startMonth}`} aria-label={`Старт на намаляването за ${marker.category}`}>
                  <line
                    x1={marker.x}
                    x2={marker.x}
                    y1={4}
                    y2={290}
                    stroke={marker.color}
                    strokeWidth="2"
                    strokeDasharray="5 4"
                    strokeLinecap="round"
                  />
                  <rect
                    x={marker.x + 3}
                    y={4 + index * 20}
                    width={140}
                    height={18}
                    rx={3}
                    fill={marker.color}
                    opacity="0.12"
                  />
                  <text
                    x={marker.x + 7}
                    y={17 + index * 20}
                    fontSize="11"
                    fill={marker.color}
                    fontWeight="700"
                  >
                    ✂ {marker.category}
                  </text>
                </g>
              ))}
            </svg>

            <div className="chart-labels twin-chart-labels">
              {chartModel.labels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>

            <div className="twin-breakdown" aria-label="Обяснение на сценария">
              <h3>Какво движи резултата</h3>
              {scenarioBreakdown.length === 0 ? (
                <p className="muted">Няма активни сценарии. Виждаш само базовата прогноза.</p>
              ) : (
                <ul>
                  {scenarioBreakdown.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </section>

      <section className="surface-card">
        <div className="surface-card__head">
          <h2>Потребителски разходи по категории</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span className="muted">Базовият модел използва тези категории за прогноза и планиране.</span>
            <button
              type="button"
              className="twin-head-toggle-btn"
              onClick={() => setIsRecurringSectionCollapsed((current) => !current)}
              aria-expanded={!isRecurringSectionCollapsed}
              aria-controls="twin-recurring-content"
            >
              {isRecurringSectionCollapsed ? "Разгъни" : "Сгъни"}
            </button>
          </div>
        </div>

        {isRecurringSectionCollapsed ? (
          <p className="muted" style={{ marginTop: "0.6rem" }}>
            Секцията е минимизирана. Използвай бутона вдясно, за да я разгънеш.
          </p>
        ) : (
          <div id="twin-recurring-content" className="twin-recurring-grid">
            <article>
              <h3>Приходи</h3>
              <div className="session-list">
                {baseline.recurringIncomes.length === 0 ? <p className="muted">Няма открити recurring приходи.</p> : null}
                {baseline.recurringIncomes.map((item) => (
                  <div key={item.key}>
                    <strong>{item.title}</strong>
                    <p>
                      {formatEur(item.amount)} месечно · увереност {Math.round(item.confidence * 100)}%
                    </p>
                  </div>
                ))}
              </div>
            </article>

            <article>
              <h3>Разходи по категории</h3>
              <div className="session-list">
                {recurringExpenseItems.length === 0 ? <p className="muted">Няма разходи по категории за визуализация.</p> : null}
                {recurringExpenseItems.map((item) => (
                  <div key={item.key}>
                    <strong>{item.title}</strong>
                    <p>
                      {formatEur(item.amount)} месечно · увер. {Math.round(item.confidence * 100)}%
                    </p>
                  </div>
                ))}
              </div>
            </article>
          </div>
        )}
      </section>

      <section
        className="surface-card twin-saved-scenarios"
        style={{ padding: "0.9rem", display: "grid", gap: "0.75rem" }}
      >
        <div className="surface-card__head" style={{ marginBottom: 0 }}>
          <h2 style={{ margin: 0 }}>Запазени сценарии</h2>
          <span className="muted">Оттук можеш само да зареждаш или обновяваш сценарии.</span>
        </div>

        <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <label>
            <span>Избери запазен сценарий</span>
            <select
              value={selectedScenarioId}
              onChange={(event) => {
                const nextId = event.target.value;
                setSelectedScenarioId(nextId);
                const picked = savedScenarios.find((item) => String(item.id) === nextId);
                if (picked) {
                  setScenarioName(picked.name || "");
                }
              }}
              disabled={scenariosLoading || savedScenarios.length === 0}
            >
              <option value="">Избери...</option>
              {savedScenarios.map((item) => (
                <option key={item.id} value={String(item.id)}>
                  {item.name || `Сценарий #${item.id}`}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="twin-saved-scenarios__actions">
          <button
            type="button"
            className="twin-action-btn twin-action-btn--load"
            onClick={() => {
              if (selectedScenario) {
                applySavedScenario(selectedScenario);
              }
            }}
            disabled={!selectedScenario || scenarioActionBusy}
          >
            Зареди
          </button>
          <button
            type="button"
            className="twin-action-btn twin-action-btn--update"
            onClick={handleUpdateScenario}
            disabled={!selectedScenario || scenarioActionBusy}
          >
            Обнови избрания
          </button>
          <button
            type="button"
            className="twin-action-btn twin-action-btn--delete"
            onClick={handleDeleteScenario}
            disabled={!selectedScenario || scenarioActionBusy}
          >
            Изтрий избрания
          </button>
        </div>

        {scenariosLoading ? <p className="muted" style={{ margin: 0 }}>Зареждане на сценарии...</p> : null}
        {scenariosError ? <p className="muted" style={{ margin: 0 }}>{scenariosError}</p> : null}
        {scenarioActionError ? <p className="muted" style={{ margin: 0 }}>{scenarioActionError}</p> : null}
        {scenarioActionMessage ? <p className="muted" style={{ margin: 0 }}>{scenarioActionMessage}</p> : null}

      </section>
    </div>
  );
}

export default FinancialTwin;
