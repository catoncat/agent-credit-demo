export function formatNumber(n: number, decimals = 1): string {
  if (n === Infinity) return '∞';
  if (n === -Infinity) return '-∞';
  if (isNaN(n)) return 'N/A';
  if (Math.abs(n) >= 1000) {
    return n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  return n.toFixed(decimals);
}

export function formatCurrency(n: number): string {
  return `${formatNumber(n)} B`;
}

export function formatPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
