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

export function isGoalCompleted(goal) {
  const status = String(goal?.status ?? '').trim().toLowerCase();
  const target = Number(goal?.target ?? goal?.target_amount ?? 0);
  const saved = Number(goal?.saved ?? goal?.saved_amount ?? 0);

  if (status === 'completed' || status === 'funded') {
    return true;
  }

  return target > 0 && saved >= target;
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

export function getWalletSavingsByGoal(goalItems = []) {
  const totals = {};

  for (const goal of Array.isArray(goalItems) ? goalItems : []) {
    const status = String(goal?.status ?? '').trim().toLowerCase();
    if (status === 'completed' || status === 'funded') {
      continue;
    }

    for (const funding of Array.isArray(goal?.fundingWallets) ? goal.fundingWallets : []) {
      const walletId = Number(funding?.walletId ?? funding?.wallet_id ?? 0);
      const amount = Number(funding?.amount ?? funding?.value ?? 0);

      if (!walletId || !Number.isFinite(amount) || amount <= 0) {
        continue;
      }

      totals[walletId] = (totals[walletId] ?? 0) + amount;
    }
  }

  return Object.fromEntries(
    Object.entries(totals)
      .map(([walletId, walletAmount]) => [Number(walletId), Number(walletAmount.toFixed(2))])
      .sort((left, right) => left[0] - right[0])
  );
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

export async function deleteGoal(id, refundWalletId = null, options = {}) {
  const optionBag = typeof refundWalletId === 'object' && refundWalletId !== null
    ? refundWalletId
    : options;

  const payload = {
    id,
    ...(typeof refundWalletId === 'number' || typeof refundWalletId === 'string'
      ? { refundWalletId: Number(refundWalletId) }
      : {}),
    ...(optionBag?.skipRefund ? { skipRefund: true } : {}),
  };

  await apiRequest("/goals.php", {
    method: "DELETE",
    body: JSON.stringify(payload),
  });
}
