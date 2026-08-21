import { apiRequest } from "./apiClient.js";

export function normalizeBudget(item) {
  const isFixedValue = item.isFixed ?? item.is_fixed ?? false;
  const typeValue = item.type ?? (isFixedValue ? "fixed" : "variable");

  return {
    id: item.id,
    category: item.category,
    limit: item.limit,
    spent: item.spent,
    period: item.period,
    startDate: item.startDate || null,
    endDate: item.endDate || null,
    categoryId: item.categoryId ?? null,
    isFixed: Boolean(isFixedValue),
    type: typeValue,
  };
}

export async function getBudgets() {
  const result = await apiRequest("/budgets.php", { method: "GET" });
  return (result.budgets || []).map(normalizeBudget);
}

export async function createBudget(payload) {
  const result = await apiRequest("/budgets.php", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return normalizeBudget(result.budget);
}

export async function updateBudget(payload) {
  const result = await apiRequest("/budgets.php", {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  return normalizeBudget(result.budget);
}

export async function deleteBudget(id) {
  await apiRequest("/budgets.php", {
    method: "DELETE",
    body: JSON.stringify({ id }),
  });
}
