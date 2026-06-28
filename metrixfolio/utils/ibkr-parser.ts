/**
 * IBKR Flex Query XML Parser
 *
 * Maps <OpenPosition> and cash report entries to our Firestore asset schema.
 * Asset IDs follow the pattern IBKR_<SYMBOL_NO_SPACES> to match the backend.
 */

export interface IBKRAsset {
  id: string;
  symbol: string;
  name: string;
  type: 'ASSET' | 'OPTION';
  amount: string;
  avg_cost: string;
  current_price: string;
  market_value: string;
  unrealized_pnl: string;
  cost_basis_money: string;
  multiplier: string;
  currency: string;
  source: 'IBKR';
  is_active: true;
  // category_id is intentionally omitted — preserve whatever is already in Firestore
}

export interface IBKRCashPosition {
  id: string;
  symbol: string;
  name: string;
  type: 'CASH';
  amount: string;
  avg_cost: string;       // always "1"
  current_price: string;  // always "1"
  market_value: string;
  unrealized_pnl: string; // always "0"
  realized_pnl: string;   // always "0"
  cost_basis_money: string;
  multiplier: string;     // always "1"
  currency: string;
  industry: 'Cash';
  sector: 'Cash';
  source: 'IBKR';
  is_active: true;
}

export interface IBKRParseResult {
  assets: IBKRAsset[];
  cashPositions: IBKRCashPosition[];
  reportDate: string; // DD/MM/YYYY from IBKR
}

/**
 * Strips all whitespace from a symbol string.
 * e.g. "SYM   260515P00050000" → "SYM260515P00050000"
 */
const normalizeSymbol = (raw: string) => raw.replace(/\s+/g, '');

/**
 * Converts DD/MM/YYYY (IBKR) to YYYY-MM-DD (ISO).
 */
export const ibkrDateToIso = (ddmmyyyy: string): string => {
  if (!ddmmyyyy) return '';
  const [d, m, y] = ddmmyyyy.split('/');
  if (!d || !m || !y) return ddmmyyyy;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};

export function parseIBKRXml(xmlString: string): IBKRParseResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');

  const parserError = doc.querySelector('parsererror');
  if (parserError) throw new Error('Invalid XML: ' + parserError.textContent);

  const statement = doc.querySelector('FlexStatement');
  const reportDate = statement?.getAttribute('toDate') ?? '';

  // ── Open Positions ────────────────────────────────────────────────────────
  const assets: IBKRAsset[] = [];
  const openPositions = doc.querySelectorAll('OpenPositions > OpenPosition');

  openPositions.forEach((pos) => {
    const assetCategory = pos.getAttribute('assetCategory') ?? '';
    const rawSymbol = pos.getAttribute('symbol') ?? '';
    const normalizedSymbol = normalizeSymbol(rawSymbol);
    const id = `IBKR_${normalizedSymbol}`;

    const isOption = assetCategory === 'OPT';
    const position = pos.getAttribute('position') ?? '0';
    const costBasisPrice = pos.getAttribute('costBasisPrice') ?? '0';
    const markPrice = pos.getAttribute('markPrice') ?? '0';
    const positionValue = pos.getAttribute('positionValue') ?? '0';
    const fifoPnl = pos.getAttribute('fifoPnlUnrealized') ?? '0';
    const costBasisMoney = pos.getAttribute('costBasisMoney') ?? '0';
    const multiplier = pos.getAttribute('multiplier') ?? '1';
    const currency = pos.getAttribute('currency') ?? 'USD';
    const description = pos.getAttribute('description') ?? normalizedSymbol;

    // For options, avg_cost from IBKR is the total cost basis (not per-share).
    // Divide by multiplier to get per-contract price, matching backend behaviour.
    let avgCost = parseFloat(costBasisPrice);
    if (isOption && parseFloat(multiplier) > 1) {
      avgCost = Math.abs(avgCost); // costBasisPrice can be negative for shorts
    }

    assets.push({
      id,
      symbol: isOption ? (pos.getAttribute('underlyingSymbol') ?? rawSymbol.trim().split(/\s+/)[0]) : rawSymbol.trim(),
      name: isOption ? description : (pos.getAttribute('description') ?? normalizedSymbol),
      type: isOption ? 'OPTION' : 'ASSET',
      amount: position,
      avg_cost: String(avgCost),
      current_price: markPrice,
      market_value: positionValue,
      unrealized_pnl: fifoPnl,
      cost_basis_money: costBasisMoney,
      multiplier,
      currency,
      source: 'IBKR',
      is_active: true,
    });
  });

  // ── Cash Positions ────────────────────────────────────────────────────────
  const cashPositions: IBKRCashPosition[] = [];
  const cashReports = doc.querySelectorAll('CashReportCurrency');

  cashReports.forEach((cr) => {
    const currency = cr.getAttribute('currency') ?? '';
    // Skip the BASE_SUMMARY roll-up row
    if (!currency || currency === 'BASE_SUMMARY') return;

    const endingCash = parseFloat(cr.getAttribute('endingCash') ?? '0');
    if (endingCash === 0) return;

    const id = `IBKR_CASH_${currency}`;

    cashPositions.push({
      id: `IBKR_${currency}`,
      symbol: currency,
      name: `${currency} Cash`,
      type: 'CASH',
      amount: String(endingCash),
      avg_cost: '1',
      current_price: '1',
      market_value: String(endingCash),
      unrealized_pnl: '0',
      realized_pnl: '0',
      cost_basis_money: String(endingCash),
      multiplier: '1',
      currency,
      industry: 'Cash',
      sector: 'Cash',
      source: 'IBKR',
      is_active: true,
    });
  });

  return { assets, cashPositions, reportDate };
}
