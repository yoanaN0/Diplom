import { apiRequest } from "./apiClient.js";

function normalizeWallet(item) {
  return {
    id: item.id,
    walletType: item.walletType,
    name: item.name,
    balance: item.balance,
    bank: item.bank || "",
    account: item.account || "",
    status: item.status || "",
    lastSync: item.updatedAt || item.lastSync || null,
    daysToReconnect: item.daysToReconnect ?? null,
    isActive: Boolean(item.isActive),
  };
}

export async function getWallets() {
  const result = await apiRequest("/wallets.php", { method: "GET" });
  return (result.wallets || []).map(normalizeWallet);
}

export async function createWallet(payload) {
  const result = await apiRequest("/wallets.php", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return normalizeWallet(result.wallet);
}

export async function updateWallet(payload) {
  const result = await apiRequest("/wallets.php", {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  return normalizeWallet(result.wallet);
}

export async function deleteWallet(id) {
  await apiRequest("/wallets.php", {
    method: "DELETE",
    body: JSON.stringify({ id }),
  });
}
