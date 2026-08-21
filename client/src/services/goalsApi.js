import { apiRequest } from "./apiClient.js";

function normalizeGoalStatus(item) {
  const rawStatus = String(item?.status ?? "").trim().toLowerCase();
  const target = Number(item?.target ?? item?.target_amount ?? 0);
  const saved = Number(item?.saved ?? item?.saved_amount ?? 0);

  if (rawStatus === "completed") {
    return "completed";
  }

  if (rawStatus === "funded") {
    return "funded";
  }

  if (target > 0 && saved >= target) {
    return "funded";
  }

  return rawStatus || "active";
}

function normalizeGoal(item) {
  return {
    id: Number(item.id),
    title: item.title,
    target: Number(item?.target ?? item?.target_amount ?? 0),
    saved: Number(item?.saved ?? item?.saved_amount ?? 0),
    deadline: item.deadline,
    status: normalizeGoalStatus(item),
    fundingWallets: Array.isArray(item.fundingWallets) ? item.fundingWallets : [],
    spentAmount: item.spentAmount ?? item.spent_amount ?? null,
    completedAt: item.completedAt ?? item.completed_at ?? null,
  };
}

export function getGoalRefundByWallet(transactions, goalId, selectedWalletId = null) {
  const byWallet = new Map();

  for (const transaction of transactions) {
    const matchesGoal = Number(transaction.goalId ?? transaction.goal_id) === Number(goalId);
    const walletId = Number(transaction.walletId ?? transaction.wallet_id ?? 0);
    const amount = Number(transaction.amount ?? 0);

    if (!matchesGoal || !walletId || !Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    if (selectedWalletId !== null && Number(selectedWalletId) !== walletId) {
      continue;
    }

    const previous = byWallet.get(walletId) ?? 0;
    byWallet.set(walletId, previous + amount);
  }

  return Object.fromEntries([...byWallet.entries()].sort((a, b) => a[0] - b[0]));
}

export function getGoalFundingWallets(goal) {
  const rawFundingWallets = Array.isArray(goal?.fundingWallets)
    ? goal.fundingWallets
    : Array.isArray(goal?.fundingSources)
      ? goal.fundingSources
      : [];

  return rawFundingWallets
    .map((entry) => ({
      walletId: Number(entry?.walletId ?? entry?.wallet_id ?? entry?.id ?? 0),
      amount: Number(entry?.amount ?? entry?.value ?? 0),
    }))
    .filter((entry) => entry.walletId > 0 && Number.isFinite(entry.amount) && entry.amount > 0)
    .sort((left, right) => left.walletId - right.walletId);
}

export async function getGoals() {
  const result = await apiRequest("/goals.php", { method: "GET" });
  return (result.goals || []).map(normalizeGoal);
}

export async function createGoal(payload) {
  const result = await apiRequest("/goals.php", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return normalizeGoal(result.goal);
}

export async function updateGoal(payload) {
  const result = await apiRequest("/goals.php", {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  return normalizeGoal(result.goal);
}

export async function deleteGoal(id, refundWalletId = null) {
  await apiRequest("/goals.php", {
    method: "DELETE",
    body: JSON.stringify({
      id,
      ...(refundWalletId ? { refundWalletId } : {}),
    }),
  });
}
