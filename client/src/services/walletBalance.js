export function calculateWalletDelta(type, amount) {
  if (type === 'income') {
    return Number(amount) || 0;
  }

  if (type === 'expense') {
    return -(Number(amount) || 0);
  }

  return 0;
}
