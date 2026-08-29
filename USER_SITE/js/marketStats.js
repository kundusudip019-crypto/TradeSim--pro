// Multi-user virtual market statistics.
// This does NOT transfer one user's loss to another user's balance.

export function aggregateMarketStats(trades) {
  let grossProfit = 0;
  let grossLoss = 0;

  for (const trade of (trades || [])) {
    const pnl = Number(trade?.pnl || 0);
    if (pnl > 0) grossProfit += pnl;
    if (pnl < 0) grossLoss += Math.abs(pnl);
  }

  return {
    grossProfit: Number(grossProfit.toFixed(2)),
    grossLoss: Number(grossLoss.toFixed(2)),
    netResult: Number((grossProfit - grossLoss).toFixed(2)),
    tradeCount: (trades || []).length
  };
}
