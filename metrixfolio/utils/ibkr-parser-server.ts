/**
 * Server-side IBKR XML parser.
 * Uses regex/string matching since DOMParser is not available in Node.js.
 * Shared types come from ibkr-parser.ts (client version uses DOMParser).
 */

import type { IBKRAsset, IBKRCashPosition, IBKRParseResult } from './ibkr-parser';

const attr = (tag: string, name: string): string => {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  return match ? match[1] : '';
};

const normalizeSymbol = (raw: string) => raw.replace(/\s+/g, '');

export function parseIBKRXmlServer(xmlString: string): IBKRParseResult {
  // Extract reportDate from FlexStatement
  const stmtMatch = xmlString.match(/<FlexStatement[^>]+>/);
  const reportDate = stmtMatch ? attr(stmtMatch[0], 'toDate') : '';

  // ── Open Positions ──────────────────────────────────────────────────────
  const assets: IBKRAsset[] = [];
  const openPosRegex = /<OpenPosition\s([^/]*?)\/>/g;
  let m: RegExpExecArray | null;

  while ((m = openPosRegex.exec(xmlString)) !== null) {
    const tag = m[0];
    const assetCategory = attr(tag, 'assetCategory');
    const rawSymbol = attr(tag, 'symbol');
    const normalizedSymbol = normalizeSymbol(rawSymbol);
    const id = `IBKR_${normalizedSymbol}`;
    const isOption = assetCategory === 'OPT';
    const multiplier = attr(tag, 'multiplier') || '1';

    let avgCost = parseFloat(attr(tag, 'costBasisPrice') || '0');
    if (isOption && parseFloat(multiplier) > 1) {
      avgCost = Math.abs(avgCost);
    }

    assets.push({
      id,
      symbol: isOption
        ? (attr(tag, 'underlyingSymbol') || rawSymbol.trim().split(/\s+/)[0])
        : rawSymbol.trim(),
      name: isOption
        ? attr(tag, 'description')
        : (attr(tag, 'description') || normalizedSymbol),
      type: isOption ? 'OPTION' : 'ASSET',
      amount: attr(tag, 'position'),
      avg_cost: String(avgCost),
      current_price: attr(tag, 'markPrice'),
      market_value: attr(tag, 'positionValue'),
      unrealized_pnl: attr(tag, 'fifoPnlUnrealized'),
      cost_basis_money: attr(tag, 'costBasisMoney'),
      multiplier,
      currency: attr(tag, 'currency'),
      source: 'IBKR',
      is_active: true,
    });
  }

  // ── Cash Positions ──────────────────────────────────────────────────────
  const cashPositions: IBKRCashPosition[] = [];
  const cashRegex = /<CashReportCurrency\s([^/]*?)\/>/g;

  while ((m = cashRegex.exec(xmlString)) !== null) {
    const tag = m[0];
    const currency = attr(tag, 'currency');
    if (!currency || currency === 'BASE_SUMMARY') continue;

    const endingCash = parseFloat(attr(tag, 'endingCash') || '0');
    if (endingCash === 0) continue;

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
      industry: 'Cash' as const,
      sector: 'Cash' as const,
      source: 'IBKR',
      is_active: true,
    });
  }

  return { assets, cashPositions, reportDate };
}
