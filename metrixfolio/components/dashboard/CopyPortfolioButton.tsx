'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { FiCopy, FiCheck } from 'react-icons/fi';
import useSWR from 'swr';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useAuth } from '@/context/AuthProvider';
import { getIBKRSummaryAction } from '@/actions/ibkr';

export const CopyPortfolioButton = () => {
  const currentPathName = usePathname();
  const { user } = useAuth();
  const { portfolio, assets, isLoading } = usePortfolio();
  const [copied, setCopied] = useState(false);

  const { data: ibkrSummary } = useSWR(
    user ? ['ibkr-summary', user.uid] : null,
    ([, userId]) => getIBKRSummaryAction(userId),
    { refreshInterval: 60000 }
  );

  // Show only on dashboard page as requested
  if (currentPathName !== '/') {
    return null;
  }

  const handleCopy = async () => {
    if (!portfolio || !assets || copied) return;

    // Helper to format float to clean 2 decimal number
    const round = (val: number | undefined | null) => {
      if (val === undefined || val === null || isNaN(val)) return 0;
      return Math.round(val * 100) / 100;
    };

    // Ensure we have the latest IBKR broker summary
    let currentSummary = ibkrSummary;
    if (!currentSummary && user) {
      try {
        currentSummary = await getIBKRSummaryAction(user.uid);
      } catch (e) {
        console.warn('Failed to fetch IBKR summary on copy:', e);
      }
    }

    // Category mapping
    const categoryMap = new Map<string, any>();

    // 1. Initialize with categories from portfolio summary
    if (portfolio.categories && portfolio.categories.length > 0) {
      portfolio.categories.forEach((cat) => {
        categoryMap.set(cat.id, {
          id: cat.id,
          name: cat.name,
          type: cat.type || 'ASSET',
          total_value: round(cat.value),
          actual_percentage: round(cat.actual_percentage),
          target_percentage: round(cat.target_percentage),
          assets: [] as any[],
        });
      });
    }

    // 2. Map assets into their categories
    assets.forEach((asset) => {
      const catId = asset.category_id || 'uncategorized';
      if (!categoryMap.has(catId)) {
        categoryMap.set(catId, {
          id: catId,
          name: catId === 'uncategorized' ? 'Uncategorized' : catId.charAt(0).toUpperCase() + catId.slice(1),
          type: asset.type || 'ASSET',
          total_value: 0,
          actual_percentage: 0,
          target_percentage: 0,
          assets: [],
        });
      }

      const mult = asset.multiplier || 1;
      const amount = asset.amount || 0;
      const avgCost = asset.avg_cost || 0;
      const currentPrice = asset.current_price || 0;
      const marketVal =
        asset.market_value !== undefined
          ? asset.market_value
          : amount * currentPrice * mult;
      const unrealizedPnl =
        asset.unrealized_pnl !== undefined
          ? asset.unrealized_pnl
          : (currentPrice - avgCost) * amount * mult;
      const costBasis = Math.abs(amount * avgCost * mult);
      const pnlPct = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;

      const isOption =
        asset.type === 'OPTION' ||
        Boolean(asset.strike) ||
        Boolean(asset.expiry) ||
        Boolean(asset.right);

      const assetItem: any = {
        symbol: asset.symbol,
        name: asset.name || asset.symbol,
        type: asset.type || (isOption ? 'OPTION' : 'ASSET'),
        quantity: round(amount),
        avg_price: round(avgCost),
        current_price: round(currentPrice),
        market_value: round(marketVal),
        unrealized_pnl: round(unrealizedPnl),
        pnl_percentage: round(pnlPct),
        sector: (asset.symbol === 'SXRV' || asset.id?.includes('SXRV')) ? 'Technology' : (asset.sector || null),
        industry: (asset.symbol === 'SXRV' || asset.id?.includes('SXRV')) ? 'Technology ETF' : (asset.industry || null),
        currency: asset.currency || 'USD',
      };

      if (isOption) {
        if (asset.strike) assetItem.strike = round(parseFloat(asset.strike));
        if (asset.right) {
          assetItem.option_type =
            asset.right === 'P' ? 'PUT' : asset.right === 'C' ? 'CALL' : asset.right;
        }
        if (asset.expiry) assetItem.expiry = asset.expiry;
      }

      categoryMap.get(catId).assets.push(assetItem);
    });

    const ibkrAccountData = currentSummary && (currentSummary.netLiquidation > 0 || currentSummary.buyingPower > 0) ? {
      net_liquidation: round(currentSummary.netLiquidation),
      excess_liquidity: round(currentSummary.excessLiquidity),
      maintenance_margin: round(currentSummary.maintenanceMargin),
      initial_margin: round(currentSummary.initialMargin),
      buying_power: round(currentSummary.buyingPower),
      ...(currentSummary.totalCashValue ? { total_cash: round(currentSummary.totalCashValue) } : {}),
      currency: 'USD',
      updated_at: currentSummary.updated_at ? new Date(currentSummary.updated_at).toISOString() : null,
    } : null;

    const payload = {
      ibkr_account: ibkrAccountData,
      portfolio_summary: {
        net_liquidation: round(portfolio.total_value),
        ...(ibkrAccountData ? {
          ibkr_net_liquidation: ibkrAccountData.net_liquidation,
          ibkr_excess_liquidity: ibkrAccountData.excess_liquidity,
          ibkr_maintenance_margin: ibkrAccountData.maintenance_margin,
          ibkr_initial_margin: ibkrAccountData.initial_margin,
          ibkr_buying_power: ibkrAccountData.buying_power,
        } : {}),
        invested_capital: round(portfolio.total_cost),
        total_pnl: round(portfolio.total_pnl),
        pnl_percentage: round(portfolio.pnl_percentage),
        unrealized_pnl: round(portfolio.unrealized_pnl),
        base_currency: portfolio.base_currency || 'USD',
        exported_at: new Date().toISOString(),
      },
      categories: Array.from(categoryMap.values()),
    };

    const jsonString = JSON.stringify(payload, null, 2);

    let success = false;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(jsonString);
        success = true;
      } catch (e) {
        console.warn('Clipboard write failed, using fallback:', e);
      }
    }

    if (!success) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = jsonString;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
        success = true;
      } catch (err) {
        console.error('Copy fallback failed:', err);
      }
    }

    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div
      className="tooltip tooltip-bottom"
      data-tip={copied ? 'JSON Copied!' : 'Copy Portfolio for AI (JSON)'}
    >
      <button
        onClick={handleCopy}
        disabled={isLoading || !portfolio}
        className={`btn btn-ghost btn-circle btn-sm transition-all duration-200 ${
          copied
            ? 'text-success bg-success/15 hover:bg-success/20 shadow-sm'
            : 'text-base-content/75 hover:bg-base-200 hover:text-base-content'
        }`}
        aria-label="Copy Portfolio JSON for AI"
        title="Copy Portfolio JSON for AI"
      >
        {copied ? (
          <FiCheck className="h-4.5 w-4.5 text-success stroke-[2.5]" />
        ) : (
          <FiCopy className="h-4.5 w-4.5" />
        )}
      </button>
    </div>
  );
};
