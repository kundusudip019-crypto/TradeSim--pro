// TradeSim Pro — virtual/demo trading configuration.
// Win/loss rate is shared and re-randomized for the overall user pool; it is NOT saved per user.
// This project uses virtual credits only.
window.TRADE_CONFIG = Object.freeze({
  sessionDurationMs: 5 * 60 * 1000,
  sessionMinutes: 5,
  minAmount: 100,
  maxAmount: 500,
  minWinRate: 22,
  maxWinRate: 90
});
