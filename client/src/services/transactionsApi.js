import { apiRequest } from "./apiClient.js";

const CHANGED_EVENT = "finly-transactions-changed";

function normalizeTransaction(item) {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    amount: item.amount,
    wallet: item.wallet,
    category: item.category,
    note: item.note || "",
    tags: Array.isArray(item.tags) ? item.tags : [],
    date: item.date,
    receipt: item.receipt || "",
    walletId: item.walletId ?? null,
    categoryId: item.categoryId ?? null,
    goalId: item.goalId ?? null,
    sourceGoalId: item.sourceGoalId ?? null,
  };
}

function sortByDateDesc(items) {
  return [...items].sort((a, b) => new Date(b.date) - new Date(a.date));
}

function notifyChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGED_EVENT));
  }
}

export async function getTransactions() {
  const result = await apiRequest("/transactions.php", { method: "GET" });
  return sortByDateDesc((result.transactions || []).map(normalizeTransaction));
}

export async function createTransaction(payload) {
  const result = await apiRequest("/transactions.php", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  notifyChanged();
  return sortByDateDesc([normalizeTransaction(result.transaction)]);
}

export async function updateTransaction(id, payload) {
  const result = await apiRequest("/transactions.php", {
    method: "PUT",
    body: JSON.stringify({ id, ...payload }),
  });

  notifyChanged();
  return sortByDateDesc([normalizeTransaction(result.transaction)]);
}

export const transactionsChangedEvent = CHANGED_EVENT;
