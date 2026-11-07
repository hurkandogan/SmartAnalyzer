import { getCachedMarketStatus } from '../jobs/marketStatusSync.js';

/**
 * Builds a lookup map of sector -> { rank, total_sectors, bull_pct, above_ema20_pct, above_sma50_pct, light }
 * using cached Market Status breadth.sector_breadth (if available).
 */
export function buildSectorLeadershipMap(marketStatus = null) {
  const ms = marketStatus || getCachedMarketStatus();
  const sectorRows = Array.isArray(ms?.breadth?.sector_breadth)
    ? ms.breadth.sector_breadth
    : Array.isArray(ms?.sector_breadth)
      ? ms.sector_breadth
      : [];
  const map = new Map();

  if (sectorRows.length > 0) {
    const sorted = [...sectorRows].sort(
      (a, b) =>
        Number(b.bull_surf_pct ?? (Number(b.green_pct || 0) + Number(b.cyan_pct || 0))) -
          Number(a.bull_surf_pct ?? (Number(a.green_pct || 0) + Number(a.cyan_pct || 0))) ||
        Number(b.pct_above_ema20 || 0) - Number(a.pct_above_ema20 || 0)
    );
    sorted.forEach((row, idx) => {
      if (!row.sector) return;
      const bullPct = Number(
        (
          row.bull_surf_pct ??
          Number(row.green_pct || 0) + Number(row.cyan_pct || 0)
        ).toFixed(1)
      );
      map.set(String(row.sector).toLowerCase(), {
        sector: row.sector,
        rank: idx + 1,
        total_sectors: sorted.length,
        bull_pct: bullPct,
        above_ema20_pct: Number(row.pct_above_ema20 || 0),
        above_sma50_pct: Number(row.pct_above_sma50 ?? row.above_sma50_pct ?? 0),
        light: row.light || (bullPct >= 50 ? 'green' : bullPct >= 30 ? 'yellow' : 'red'),
      });
    });
  }

  return map;
}

/**
 * Computes Kristoffer's 5-Pillar Conviction Score (0-100) and Tier ('A+' | 'A' | 'B' | 'C')
 * for either a 'qullamaggie' or 'early_surf' setup.
 *
 * 5 Pillars (100 pts total):
 *  1. Sector Wind / Leadership (max 20 pts)
 *  2. ADR% Volatility Fuel (max 20 pts)
 *  3. Tightness, VCP & Volume Dry-Up / Pocket Pivots (max 25 pts)
 *  4. Stop Distance & R:R Asymmetry (max 20 pts)
 *  5. Catalyst, Relative Strength & Fundamental Power (max 15 pts)
 */
export function computeConviction({
  analysisType = 'qullamaggie',
  status = 'watch',
  score = 0,
  price = 0,
  reason = {},
  fundScore = 0,
  fundReason = {},
  universeSector = null,
  lifecycleStatus = 'active',
  upgradedToCandidate = false,
  sectorLeadershipMap = null,
}) {
  const r = typeof reason === 'string' ? safeParse(reason) : reason || {};
  const fr = typeof fundReason === 'string' ? safeParse(fundReason) : fundReason || {};
  const curPrice = Number(price || r?.trade_params?.entry_reference || 0);

  // Resolve Sector & Leadership Rank (prefer valid non-N/A sector from screener_universe or fundamentals)
  const rawFundSector = fr?.sector && fr.sector !== 'N/A' && fr.sector !== 'Unknown' ? fr.sector : null;
  const rawReasonSector =
    r?.fundamentals?.sector && r.fundamentals.sector !== 'N/A'
      ? r.fundamentals.sector
      : r?.sector && r.sector !== 'N/A'
        ? r.sector
        : null;
  const sectorName =
    universeSector ||
    rawFundSector ||
    rawReasonSector ||
    'Unknown';

  const sectorKey = String(sectorName).toLowerCase();
  const sMap = sectorLeadershipMap || buildSectorLeadershipMap();
  const sectorInfo = sMap.get(sectorKey) || null;

  let sectorPts = 12;
  if (sectorInfo) {
    const topQuarter = Math.max(5, Math.ceil(sectorInfo.total_sectors * 0.25));
    const topHalf = Math.max(12, Math.ceil(sectorInfo.total_sectors * 0.5));
    if (sectorInfo.rank <= topQuarter || sectorInfo.bull_pct >= 58 || sectorInfo.light === 'green') {
      sectorPts = sectorInfo.rank <= 5 || sectorInfo.bull_pct >= 62 ? 20 : 18;
    } else if (sectorInfo.rank <= topHalf || sectorInfo.bull_pct >= 35 || sectorInfo.light === 'yellow') {
      sectorPts = 14;
    } else if (sectorInfo.bull_pct >= 20) {
      sectorPts = 9;
    } else {
      sectorPts = 5;
    }
  }

  const tags = [];
  if (sectorInfo) {
    if (sectorInfo.rank <= 8 || sectorInfo.light === 'green') {
      tags.push(`🏆 #${sectorInfo.rank} ${sectorInfo.sector} (${sectorInfo.bull_pct}% Bull)`);
    } else {
      tags.push(`${sectorInfo.sector} (#${sectorInfo.rank}/${sectorInfo.total_sectors})`);
    }
  } else if (sectorName && sectorName !== 'Unknown') {
    tags.push(sectorName);
  }

  let adrPct = 0;
  let adrPts = 10;
  let tightnessVolPts = 10;
  let riskRewardPts = 10;
  let catalystRsPts = 8;
  let suggestedStop = null;
  let riskPct = null;
  let stopToAdr = null;

  if (analysisType === 'early_surf') {
    const m = r.metrics || {};
    const b = r.breakdown || {};
    const tp = r.trade_params || {};

    adrPct = Number(m.adr20 ?? r.adr_pct ?? 0);
    if (adrPct >= 3.8 && adrPct <= 8.5) {
      adrPts = 20;
      tags.push(`⚡ ${adrPct.toFixed(1)}% ADR`);
    } else if ((adrPct >= 2.8 && adrPct < 3.8) || (adrPct > 8.5 && adrPct <= 11.5)) {
      adrPts = 16;
      tags.push(`⚡ ${adrPct.toFixed(1)}% ADR`);
    } else if (adrPct >= 2.2) {
      adrPts = 12;
    } else {
      adrPts = 7;
    }

    // Pillar 3: Tightness, Pinch & Volume Pocket (max 25)
    const pinch = Number(b.sma50_pinch || 0);
    const volPocket = Number(b.volume_pocket || 0);
    const coil = Number(b.coiling || 0);
    const pp10 = Number(m.pocket_pivots_10d || 0);
    const dry10 = Number(m.dryup_days_10d || 0);
    const range3dAdr = Number(m.range_3d_to_adr ?? 1.0);

    let tvRaw = Math.round(((pinch + volPocket + coil) / 55) * 18);
    if (pp10 >= 1) {
      tvRaw += 4;
      tags.push(`🔥 ${pp10} Pocket Pivot${pp10 > 1 ? 's' : ''}`);
    }
    if (dry10 >= 3 && range3dAdr <= 0.95) {
      tvRaw += 3;
      tags.push(`🎯 Tight Coil (${range3dAdr.toFixed(2)}x ADR)`);
    }
    tightnessVolPts = clamp(tvRaw, 0, 25);

    // Pillar 4: Stop Distance & R:R (max 20)
    suggestedStop = Number(tp.suggested_stop || r.suggested_stop || 0) || null;
    if (!suggestedStop && curPrice > 0) {
      suggestedStop = Number((curPrice * 0.978).toFixed(2));
    }
    riskPct =
      Number(tp.risk_pct || r.risk_pct || 0) ||
      (curPrice > 0 && suggestedStop ? Number((((curPrice - suggestedStop) / curPrice) * 100).toFixed(2)) : 2.5);
    stopToAdr = adrPct > 0 ? Number((riskPct / adrPct).toFixed(2)) : 0.7;

    if (riskPct >= 1.0 && riskPct <= 2.5) {
      riskRewardPts = 20;
      tags.push(`🛡️ -${riskPct.toFixed(1)}% Stop (${stopToAdr}x ADR)`);
    } else if (riskPct <= 3.2 || stopToAdr <= 0.75) {
      riskRewardPts = 16;
      tags.push(`🛡️ -${riskPct.toFixed(1)}% Stop`);
    } else if (riskPct <= 4.0) {
      riskRewardPts = 12;
    } else {
      riskRewardPts = 7;
    }

    // Pillar 5: Catalyst, Surf Lead & Fundamentals (max 15)
    const surfPts = Number(b.ema_surf || 0);
    const rsiPts = Number(b.rsi_sweetspot || 0);
    let catRaw = Math.round(((surfPts + rsiPts) / 35) * 9);
    const effFundScore = Number(fundScore || r.fundamentals?.fund_score || 0);
    const revGrowth = Number(fr.revenue_growth ?? r.fundamentals?.rev_growth ?? 0);
    const udVol = Number(m.ud_vol_10d ?? fr.up_down_vol_ratio ?? 1.0);
    const hasNetCash = Boolean(fr.has_net_cash || r.fundamentals?.has_net_cash);

    if (r.surf_phase === 'phase_2_bridge_cross' || effFundScore >= 55) catRaw += 3;
    if (udVol >= 1.25 || revGrowth >= 0.15 || hasNetCash || upgradedToCandidate) catRaw += 3;
    catalystRsPts = clamp(catRaw, 0, 15);
  } else {
    // QULLAMAGGIE BREAKOUT / FLAG CONVICTION
    adrPct = Number(r.adr_pct || 0);
    if (adrPct >= 4.8 && adrPct <= 9.5) {
      adrPts = 20;
      tags.push(`⚡ ${adrPct.toFixed(1)}% ADR`);
    } else if ((adrPct >= 4.2 && adrPct < 4.8) || (adrPct > 9.5 && adrPct <= 12.5)) {
      adrPts = 17;
      tags.push(`⚡ ${adrPct.toFixed(1)}% ADR`);
    } else if (adrPct >= 3.6) {
      adrPts = 12;
    } else {
      adrPts = 7;
    }

    // Pillar 3: VCP Tightness & Volume Dry-Up (max 25)
    const tightScore = Number(r.tightness_score || 0);
    const volScore = Number(r.vol_score || 0);
    const isTight = Boolean(r.is_tight);
    const isDry = Boolean(r.is_dry);
    const extPct = Math.abs(Number(r.ext_pct || 0));

    let tvRaw = Math.round(((tightScore + volScore) / 40) * 18);
    if (isTight && isDry) {
      tvRaw += 4;
      tags.push('🔥 Tight + Dry VCP');
    } else if (isTight) {
      tvRaw += 2;
      tags.push('🎯 Tight Flag');
    } else if (isDry) {
      tvRaw += 2;
      tags.push('💧 Vol Dry-Up');
    }
    if (extPct <= 0.035) {
      tvRaw += 3;
    }
    tightnessVolPts = clamp(tvRaw, 0, 25);

    // Pillar 4: Tactical Stop Distance & R:R (max 20)
    const lodStop = Number(r.stop_loss_lod || 0);
    const ema20 = Number(r.ema_20 || 0);
    const ema20Stop = ema20 > 0 ? Number((ema20 * 0.995).toFixed(2)) : 0;

    if (curPrice > 0) {
      const lodRisk = lodStop > 0 && lodStop < curPrice ? ((curPrice - lodStop) / curPrice) * 100 : 99;
      const ema20Risk = ema20Stop > 0 && ema20Stop < curPrice ? ((curPrice - ema20Stop) / curPrice) * 100 : 99;

      if (lodRisk >= 0.8 && lodRisk <= 4.5) {
        suggestedStop = lodStop;
        riskPct = Number(lodRisk.toFixed(2));
      } else if (ema20Risk >= 1.0 && ema20Risk <= 5.5) {
        suggestedStop = ema20Stop;
        riskPct = Number(ema20Risk.toFixed(2));
      } else if (lodStop > 0 && lodStop < curPrice) {
        suggestedStop = Number(Math.max(curPrice * 0.95, Math.min(curPrice * 0.985, lodStop)).toFixed(2));
        riskPct = Number((((curPrice - suggestedStop) / curPrice) * 100).toFixed(2));
      } else {
        suggestedStop = Number((curPrice * 0.968).toFixed(2));
        riskPct = 3.2;
      }
    } else {
      riskPct = 3.5;
    }

    stopToAdr = adrPct > 0 && riskPct !== null ? Number((riskPct / adrPct).toFixed(2)) : 0.75;

    if ((riskPct !== null && riskPct <= 3.0) || (stopToAdr !== null && stopToAdr <= 0.65)) {
      riskRewardPts = 20;
      tags.push(`🛡️ -${riskPct.toFixed(1)}% Stop (${stopToAdr}x ADR)`);
    } else if ((riskPct !== null && riskPct <= 4.2) || (stopToAdr !== null && stopToAdr <= 0.9)) {
      riskRewardPts = 16;
      tags.push(`🛡️ -${riskPct.toFixed(1)}% Stop`);
    } else if (riskPct !== null && riskPct <= 5.5) {
      riskRewardPts = 12;
    } else {
      riskRewardPts = 7;
    }

    // Pillar 5: Catalyst, RS & Fundamentals (max 15)
    const rsScore = Number(r.rs_score || 0);
    const polePct = Number(r.pole_return_pct || 0);
    const effFundScore = Number(fundScore || 0);
    const revGrowth = Number(fr.revenue_growth || 0);
    const udVol = Number(fr.up_down_vol_ratio || 1.0);
    const hasNetCash = Boolean(fr.has_net_cash);
    const isAccel = Boolean(fr.is_accelerating);

    let catRaw = Math.round((rsScore / 30) * 8);
    if (effFundScore >= 55 || revGrowth >= 0.15) catRaw += 3;
    if (udVol >= 1.2 || isAccel || hasNetCash) catRaw += 2;
    if (polePct >= 45 || upgradedToCandidate) {
      catRaw += 2;
      if (polePct >= 45) tags.push(`🚀 +${polePct.toFixed(0)}% Pole`);
    }
    catalystRsPts = clamp(catRaw, 0, 15);
  }

  let totalConviction =
    sectorPts + adrPts + tightnessVolPts + riskRewardPts + catalystRsPts;

  if (lifecycleStatus === 'paused') {
    totalConviction = Math.max(0, totalConviction - 8);
  }

  totalConviction = clamp(Math.round(totalConviction), 0, 100);

  let tier = 'C';
  if (totalConviction >= 85 && status === 'candidate' && lifecycleStatus !== 'paused') {
    tier = 'A+';
  } else if (totalConviction >= 74) {
    tier = 'A';
  } else if (totalConviction >= 62) {
    tier = 'B';
  }

  return {
    score: totalConviction,
    tier,
    status,
    lifecycle_status: lifecycleStatus,
    sector: sectorName,
    sector_rank: sectorInfo?.rank ?? null,
    total_sectors: sectorInfo?.total_sectors ?? null,
    sector_bull_pct: sectorInfo?.bull_pct ?? null,
    adr_pct: Number(adrPct.toFixed(2)),
    suggested_stop: suggestedStop,
    risk_pct: riskPct,
    stop_to_adr: stopToAdr,
    breakdown: {
      sector_pts: sectorPts,
      sector_max: 20,
      adr_pts: adrPts,
      adr_max: 20,
      tightness_vol_pts: tightnessVolPts,
      tightness_vol_max: 25,
      risk_reward_pts: riskRewardPts,
      risk_reward_max: 20,
      catalyst_rs_pts: catalystRsPts,
      catalyst_rs_max: 15,
    },
    tags: tags.slice(0, 4),
  };
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function safeParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}
