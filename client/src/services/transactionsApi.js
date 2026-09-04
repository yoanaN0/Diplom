import { apiRequest } from "./apiClient.js";
import { getSessionUser } from "./authStorage.js";

const CHANGED_EVENT = "finly-transactions-changed";

function normalizeTransaction(item) {
  return {
    id: item.id,
    userId: item.userId ?? null,
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
  const normalized = (result.transactions || []).map(normalizeTransaction);
  const sessionUserId = Number(getSessionUser()?.id || 0);

  // Defensive client-side isolation: keep only current-user rows when userId is present.
  const filtered = sessionUserId > 0
    ? normalized.filter((item) => item.userId === null || Number(item.userId) === sessionUserId)
    : normalized;

  return sortByDateDesc(filtered);
}

export async function createTransactionDetailed(payload) {
  const result = await apiRequest("/transactions.php", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const normalizedTransaction = result.transaction ? normalizeTransaction(result.transaction) : null;

  if (!result.duplicate && normalizedTransaction) {
    notifyChanged();
  }

  return {
    duplicate: Boolean(result.duplicate),
    transaction: normalizedTransaction,
    sourceReference: result.sourceReference ?? null,
  };
}

export async function createTransaction(payload) {
  const result = await createTransactionDetailed(payload);
  return result.transaction ? sortByDateDesc([result.transaction]) : [];
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
