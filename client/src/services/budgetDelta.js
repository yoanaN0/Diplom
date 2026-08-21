export function calculateBudgetDelta(type, amount) {
  if (type === 'expense') {
    return Number(amount) || 0;
  }

  return 0;
}
