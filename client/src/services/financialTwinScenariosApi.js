import { apiRequest } from "./apiClient.js";

function normalizeScenario(item) {
  return {
    id: Number(item.id),
    name: String(item.name || ""),
    horizonMonths: Number(item.horizonMonths || item.horizon_months || 12),
    draft: item.draft && typeof item.draft === "object" ? item.draft : {},
    modifiers: item.modifiers && typeof item.modifiers === "object" ? item.modifiers : {},
    createdAt: item.createdAt || item.created_at || null,
    updatedAt: item.updatedAt || item.updated_at || null,
  };
}

export async function getFinancialTwinScenarios() {
  const result = await apiRequest("/financial-twin-scenarios.php", { method: "GET" });
  return (result.scenarios || []).map(normalizeScenario);
}

export async function createFinancialTwinScenario(payload) {
  const result = await apiRequest("/financial-twin-scenarios.php", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return normalizeScenario(result.scenario || {});
}

export async function updateFinancialTwinScenario(payload) {
  const result = await apiRequest("/financial-twin-scenarios.php", {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  return normalizeScenario(result.scenario || {});
}

export async function deleteFinancialTwinScenario(id) {
  await apiRequest("/financial-twin-scenarios.php", {
    method: "DELETE",
    body: JSON.stringify({ id }),
  });
}
