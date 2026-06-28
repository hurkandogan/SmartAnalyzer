/** Kraken symbol mapping — raw Kraken key → clean symbol */
export const KRAKEN_SYMBOL_MAP = {
  // Bitcoin variants
  XXBT: 'BTC',
  XBT: 'BTC',
  BTC: 'BTC',
  'XXBT.S': 'BTC',
  'XBT.S': 'BTC',
  'BTC.S': 'BTC',
  'BT.B': 'BTC', // bonded/staked via Kraken Earn
  'XBT.B': 'BTC', // bonded/staked via Kraken Earn (X-prefixed)
  'XBT.F': 'BTC', // flexible earn
  // Ethereum variants
  XETH: 'ETH',
  ETH: 'ETH',
  'XETH.S': 'ETH',
  'ETH2.S': 'ETH',
  'ETH.S': 'ETH',
  'ETH.B': 'ETH', // bonded/staked via Kraken Earn
  'ETH.F': 'ETH', // flexible earn
  // XRP variants
  XXRP: 'XRP',
  XRP: 'XRP',
  'XRP.S': 'XRP',
  'XXRP.S': 'XRP',
  // Other
  XLTC: 'LTC',
  LTC: 'LTC',
  XADA: 'ADA',
  ADA: 'ADA',
  XDOT: 'DOT',
  DOT: 'DOT',
  'DOT.S': 'DOT',
  'DOT28.S': 'DOT',
  XXLM: 'XLM',
  XLM: 'XLM',
  EIGEN: 'EIGEN',
  // Fiat
  ZUSD: 'USD',
  USD: 'USD',
  ZEUR: 'EUR',
  EUR: 'EUR',
  ZGBP: 'GBP',
  GBP: 'GBP',
};

/** Crypto symbols we care about for price fetching (Kraken pair format) */
export const KRAKEN_PRICE_PAIRS = ['XXBTZUSD', 'XETHZUSD', 'XXRPZUSD'];

/** Map Kraken pair → clean symbol */
export const KRAKEN_PAIR_TO_SYMBOL = {
  XXBTZUSD: 'BTC',
  XETHZUSD: 'ETH',
  XXRPZUSD: 'XRP',
};

/** Currency pairs to track (all relative to USD) */
export const CURRENCY_TARGETS = ['EUR', 'TRY', 'GBP', 'CHF'];
