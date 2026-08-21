const STORAGE_KEY = "finly.source-balances.v1";
export const sourceBalancesChangedEvent = "finly-source-balances-changed";

function readBalancesMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persistBalancesMap(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(sourceBalancesChangedEvent));
  }
}

export function getSourceBalance(sourceId, fallback = 0) {
  const map = readBalancesMap();
  const value = Number(map[sourceId]);
  return Number.isFinite(value) ? value : fallback;
}

export function setSourceBalance(sourceId, balance) {
  const map = readBalancesMap();
  map[sourceId] = Number(balance) || 0;
  persistBalancesMap(map);
}