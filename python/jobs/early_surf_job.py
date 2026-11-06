import sys
import os
import json
import logging
from datetime import datetime, timedelta
import pandas as pd
import numpy as np

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '.env'))

# Adjust path to import from database
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.db import SessionLocal
from database.models import ScreenerUniverse, AnalysisScore, Candle
from utils.market_time import trading_today, utc_now_naive

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("early_surf_job")

def compute_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    up = delta.clip(lower=0)
    down = -1 * delta.clip(upper=0)
    ma_up = up.ewm(alpha=1/period, min_periods=period, adjust=False).mean()
    ma_down = down.ewm(alpha=1/period, min_periods=period, adjust=False).mean()
    rs = ma_up / ma_down.replace(0, np.nan)
    return 100 - (100 / (1 + rs))

def calculate_early_surf(symbol: str, df: pd.DataFrame, fund_data: dict):
    """
    Early Surf Setup Detector & Quantitative Smooth-Scoring Engine.
    Detects Stage-1 to Stage-2 MA Pinch & Ignition before massive Wave-1 breakouts.
    Total Max Score: 100 points.
    Status: 'candidate' (>= 70), 'watch' (55-69), 'no_setup' (< 55)
    """
    if len(df) < 60:
        return None

    # Filter out 0-volume days
    df = df[df['Volume'] > 0].copy().reset_index(drop=True)
    if len(df) < 55:
        return None

    close = df['Close'].astype(float)
    high = df['High'].astype(float)
    low = df['Low'].astype(float)
    opn = df['Open'].astype(float)
    vol = df['Volume'].astype(float)

    current_price = float(close.iloc[-1])
    current_vol = float(vol.iloc[-1])

    # Minimum liquidity gates
    vol_ma20 = float(vol.tail(20).mean())
    if current_price < 5.0 or vol_ma20 < 100000:
        return None

    # 1. Moving Averages
    ema10_series = close.ewm(span=10, adjust=False).mean()
    ema20_series = close.ewm(span=20, adjust=False).mean()
    sma50_series = close.rolling(window=50).mean()
    sma200_series = close.rolling(window=200).mean()

    current_ema10 = float(ema10_series.iloc[-1])
    current_ema20 = float(ema20_series.iloc[-1])
    current_sma50 = float(sma50_series.iloc[-1]) if pd.notna(sma50_series.iloc[-1]) else None
    current_sma200 = float(sma200_series.iloc[-1]) if pd.notna(sma200_series.iloc[-1]) else None

    if not current_sma50 or current_sma50 <= 0:
        return None

    # 2. Daily Range % & ADR (20D)
    daily_range_pct = ((high - low) / close.replace(0, np.nan)) * 100.0
    adr20_series = daily_range_pct.rolling(window=20).mean()
    current_adr20 = float(adr20_series.iloc[-1]) if pd.notna(adr20_series.iloc[-1]) else float(daily_range_pct.mean())
    if pd.isna(current_adr20) or current_adr20 <= 0:
        current_adr20 = 2.5

    # 3. RVOL & Up/Down Volume & Pocket Pivots
    vol_ma20_series = vol.rolling(20).mean()
    rvol_series = vol / vol_ma20_series.replace(0, np.nan)
    current_rvol = float(rvol_series.iloc[-1]) if pd.notna(rvol_series.iloc[-1]) else 1.0

    ret_1d = close.pct_change(1)
    up_vol = np.where(ret_1d > 0, vol, 0.0)
    dn_vol = np.where(ret_1d < 0, vol, 0.0)
    up_vol_10d = pd.Series(up_vol).rolling(10).sum()
    dn_vol_10d = pd.Series(dn_vol).rolling(10).sum()
    ud_ratio_10d = up_vol_10d / dn_vol_10d.replace(0, np.nan)
    current_ud_vol = float(ud_ratio_10d.iloc[-1]) if pd.notna(ud_ratio_10d.iloc[-1]) else 1.0
    if current_ud_vol > 15.0:
        current_ud_vol = 15.0

    # Pocket pivot in last 10 days
    max_dn_vol_10d = pd.Series(dn_vol).shift(1).rolling(10).max()
    pocket_pivot_series = (ret_1d > 0) & (vol > max_dn_vol_10d)
    pp_count_10d = int(pocket_pivot_series.tail(10).sum())

    # Dry-up days in last 10 days (RVOL < 0.85)
    dryup_days_10d = int((rvol_series.tail(10) < 0.85).sum())

    # 4. RSI (14)
    rsi_series = compute_rsi(close, 14)
    current_rsi = float(rsi_series.iloc[-1]) if pd.notna(rsi_series.iloc[-1]) else 50.0

    # 5. Moving Average Relationships & Coiling Metrics
    ext_sma50_pct = float((current_price / current_sma50 - 1.0) * 100.0)
    ext_ema10_pct = float((current_price / current_ema10 - 1.0) * 100.0)

    # Days EMA10 has been above EMA20 in the last 10 trading days
    ema10_gt_20_series = (ema10_series > ema20_series).tail(10)
    ema10_gt_20_days = int(ema10_gt_20_series.sum())

    # Days Close has been above SMA50 in the last 10 trading days
    close_gt_sma50_days = int((close > sma50_series).tail(10).sum())

    # 3-Day & 5-Day Range Compression vs ADR
    range_3d_mean = float(daily_range_pct.tail(3).mean())
    range_5d_mean = float(daily_range_pct.tail(5).mean())
    range_3d_to_adr = float(range_3d_mean / current_adr20) if current_adr20 > 0 else 1.0
    range_5d_to_adr = float(range_5d_mean / current_adr20) if current_adr20 > 0 else 1.0

    # SMA50 5-day slope %
    sma50_5d_ago = float(sma50_series.iloc[-6]) if len(sma50_series) >= 6 and pd.notna(sma50_series.iloc[-6]) else current_sma50
    sma50_slope_5d = float(((current_sma50 / sma50_5d_ago) - 1.0) * 100.0) if sma50_5d_ago > 0 else 0.0

    # Recent 20D Drawdown
    high_20d = float(high.tail(20).max())
    low_20d = float(low.tail(20).min())
    dd_20d_pct = float(((high_20d - low_20d) / high_20d) * 100.0) if high_20d > 0 else 0.0

    # ── 6. Kademeli / Yumuşak Puanlama Matrisi (Maks 100 Puan) ──
    score_breakdown = {}
    total_score = 0.0

    # --- Kategori A: SMA50 Mesafesi / Pinch (Maks 25 Puan) ---
    # En tatlı nokta: Fiyat SMA50'nin hemen üzerinde (%0.0 - %3.5)
    # Fiyat SMA50'nin %2'den fazla altındaysa veya %7'den fazla uzağındaysa ceza
    sma50_score = 0.0
    if -1.0 <= ext_sma50_pct <= 2.0:
        sma50_score = 25.0
    elif 2.0 < ext_sma50_pct <= 3.5:
        sma50_score = 22.0
    elif 3.5 < ext_sma50_pct <= 5.0:
        sma50_score = 17.0
    elif 5.0 < ext_sma50_pct <= 6.5:
        sma50_score = 10.0
    elif -2.5 <= ext_sma50_pct < -1.0:
        sma50_score = 12.0
    elif -4.0 <= ext_sma50_pct < -2.5:
        sma50_score = 6.0
    else:
        sma50_score = 0.0
    score_breakdown['sma50_pinch'] = round(sma50_score, 1)
    total_score += sma50_score

    # --- Kategori B: Öncü EMA Sörfü (EMA10 > EMA20 Süresi) (Maks 20 Puan) ---
    # EMA10, EMA20'nin üzerinde ne kadar kararlı sörf yapıyorsa taban o kadar sağlam
    surf_score = 0.0
    if ema10_gt_20_days >= 7:
        surf_score = 20.0
    elif ema10_gt_20_days >= 5:
        surf_score = 16.0
    elif ema10_gt_20_days >= 3:
        surf_score = 12.0
    elif ema10_gt_20_days >= 1:
        surf_score = 6.0
    else:
        surf_score = 0.0

    # İlave Bonus: EMA10 SMA50'nin de üstündeyse
    if current_ema10 >= current_sma50 and surf_score > 0:
        surf_score = min(20.0, surf_score + 2.0)

    score_breakdown['ema_surf'] = round(surf_score, 1)
    total_score += surf_score

    # --- Kategori C: Hacim Kuruması, Toplama & Pocket Pivots (Maks 20 Puan) ---
    vol_score = 0.0
    # 1. Sessiz Kuruma (0-8 Puan)
    if dryup_days_10d >= 5:
        vol_score += 8.0
    elif dryup_days_10d >= 3:
        vol_score += 5.5
    elif dryup_days_10d >= 1:
        vol_score += 3.0

    # 2. Pocket Pivots (0-7 Puan)
    if pp_count_10d >= 2:
        vol_score += 7.0
    elif pp_count_10d == 1:
        vol_score += 4.5

    # 3. Up/Down Volume Ratio (0-5 Puan)
    if current_ud_vol >= 1.5:
        vol_score += 5.0
    elif current_ud_vol >= 1.15:
        vol_score += 3.5
    elif current_ud_vol >= 0.95:
        vol_score += 2.0

    vol_score = min(20.0, vol_score)
    score_breakdown['volume_pocket'] = round(vol_score, 1)
    total_score += vol_score

    # --- Kategori D: RSI Tatlı Noktası & Momentumu (Maks 15 Puan) ---
    # Tatlı aralık: 52 - 63 (Henüz aşırı alımda değil ama pozitif ivmede)
    rsi_score = 0.0
    if 52.0 <= current_rsi <= 63.0:
        rsi_score = 15.0
    elif (48.0 <= current_rsi < 52.0) or (63.0 < current_rsi <= 67.0):
        rsi_score = 12.0
    elif (44.0 <= current_rsi < 48.0) or (67.0 < current_rsi <= 71.0):
        rsi_score = 7.0
    elif 40.0 <= current_rsi < 44.0:
        rsi_score = 4.0
    else:
        rsi_score = 1.0

    score_breakdown['rsi_sweetspot'] = round(rsi_score, 1)
    total_score += rsi_score

    # --- Kategori E: Mum Sıkışması / Coiling & Taban Düzeni (Maks 10 Puan) ---
    coiling_score = 0.0
    if range_3d_to_adr <= 0.85:
        coiling_score += 6.0
    elif range_3d_to_adr <= 1.05:
        coiling_score += 4.0
    elif range_3d_to_adr <= 1.25:
        coiling_score += 2.0

    # Taban düzensiz derin düşüş yaşamamış olmalı (20d dd <= 20%) & SMA50 kafasını kaldırmış olmalı
    if dd_20d_pct <= 18.0 and sma50_slope_5d >= -0.5:
        coiling_score += 4.0
    elif dd_20d_pct <= 25.0:
        coiling_score += 2.0

    coiling_score = min(10.0, coiling_score)
    score_breakdown['coiling'] = round(coiling_score, 1)
    total_score += coiling_score

    # --- Kategori F: Fundamental Büyüme & Kalite Desteği (Maks 10 Puan) ---
    fund_score_pts = 0.0
    fund_total = float(fund_data.get('fund_score', 0) or 0)
    rev_growth = fund_data.get('rev_growth')
    has_net_cash = bool(fund_data.get('has_net_cash', False))
    is_accel = bool(fund_data.get('is_accelerating', False))

    if rev_growth is not None:
        try:
            rev_growth = float(rev_growth)
        except Exception:
            rev_growth = None

    if fund_total >= 60.0 or (rev_growth is not None and rev_growth >= 0.20):
        fund_score_pts = 10.0
    elif fund_total >= 45.0 or (rev_growth is not None and rev_growth >= 0.10):
        fund_score_pts = 7.5
    elif fund_total >= 30.0 or has_net_cash or is_accel:
        fund_score_pts = 5.0
    else:
        fund_score_pts = 2.0

    score_breakdown['fundamentals'] = round(fund_score_pts, 1)
    total_score += fund_score_pts

    raw_score = int(round(total_score))

    # ── 7. Trade Parametreleri (Giriş Referansı ve Stop) ────────
    # Stop noktası: SMA50'nin %1 altı veya son 3 günün en düşüğü (hangisi daha yakın ve mantıklıysa)
    recent_3d_low = float(low.tail(3).min())
    stop_ref_sma50 = current_sma50 * 0.99
    suggested_stop = round(min(recent_3d_low, stop_ref_sma50), 2)
    # Emniyet: stop fiyatı girişin üzerinde olamaz, girişten en fazla %7.5 uzakta olabilir
    if suggested_stop >= current_price:
        suggested_stop = round(current_price * 0.96, 2)
    elif suggested_stop < current_price * 0.925:
        suggested_stop = round(current_price * 0.94, 2)

    risk_pct = round(((current_price - suggested_stop) / current_price) * 100.0, 2)

    # ── 8. Katı Eleme Kuralları (Hard Structural Gates & Anti-Pinning) ──
    avg_dollar_vol = vol_ma20 * current_price
    tail_10_high = float(high.tail(10).max()) if len(high) >= 10 else float(high.max())
    tail_10_low = float(low.tail(10).min()) if len(low) >= 10 else float(low.min())
    ten_day_range_pct = float(((tail_10_high - tail_10_low) / tail_10_low) * 100.0) if tail_10_low > 0 else 0.0
    is_pinned = bool(range_5d_mean < 1.2 or ten_day_range_pct < 2.5)

    is_no_setup = False
    if avg_dollar_vol < 10_000_000:
        is_no_setup = True
    if current_adr20 < 2.2:
        is_no_setup = True
    if is_pinned:
        is_no_setup = True
    if ext_sma50_pct < -2.5 or ext_sma50_pct > 5.5:
        is_no_setup = True
    if ema10_gt_20_days < 1:
        is_no_setup = True
    if current_rsi < 45.0 or current_rsi > 72.0:
        is_no_setup = True

    if is_no_setup:
        status = 'no_setup'
    elif raw_score >= 72 and sma50_score >= 17.0 and surf_score >= 12.0:
        status = 'candidate'
    elif raw_score >= 58 and sma50_score >= 10.0:
        status = 'watch'
    else:
        status = 'no_setup'

    final_score = 0 if status == 'no_setup' else raw_score

    reason_payload = {
        'status': status,
        'score': final_score,
        'raw_score': raw_score,
        'pinned_stock': is_pinned,
        'breakdown': score_breakdown,
        'metrics': {
            'ext_sma50_pct': round(ext_sma50_pct, 2),
            'ext_ema10_pct': round(ext_ema10_pct, 2),
            'ema10_gt_20_days': ema10_gt_20_days,
            'close_gt_sma50_days': close_gt_sma50_days,
            'rsi': round(current_rsi, 1),
            'adr20': round(current_adr20, 2),
            'rvol': round(current_rvol, 2),
            'ud_vol_10d': round(current_ud_vol, 2),
            'pocket_pivots_10d': pp_count_10d,
            'dryup_days_10d': dryup_days_10d,
            'range_3d_to_adr': round(range_3d_to_adr, 2),
            'sma50_slope_5d': round(sma50_slope_5d, 2),
            'dd_20d_pct': round(dd_20d_pct, 1),
        },
        'trade_params': {
            'entry_reference': current_price,
            'suggested_stop': suggested_stop,
            'risk_pct': risk_pct,
        },
        'fundamentals': {
            'fund_score': fund_total,
            'rev_growth': rev_growth,
            'has_net_cash': has_net_cash,
            'is_accelerating': is_accel,
        }
    }

    return {
        'symbol': symbol,
        'score': final_score,
        'status': status,
        'price': current_price,
        'ema10': current_ema10,
        'ema20': current_ema20,
        'sma50': current_sma50,
        'sma200': current_sma200,
        'adr_pct': current_adr20,
        'rvol': current_rvol,
        'rsi': current_rsi,
        'suggested_stop': suggested_stop,
        'risk_pct': risk_pct,
        'reason': json.dumps(reason_payload),
    }

def main():
    db = SessionLocal()
    try:
        session_date = trading_today()
        logger.info(f"Starting Early Surf Analysis Job for date: {session_date}")

        # 1. Load Fundamental Analysis Scores
        fund_scores = db.query(AnalysisScore).filter(AnalysisScore.analysis_type == 'fundamentals').all()
        fund_map = {}
        for r in fund_scores:
            data = r.reason if isinstance(r.reason, dict) else {}
            if isinstance(r.reason, str):
                try:
                    data = json.loads(r.reason)
                except Exception:
                    data = {}
            fund_map[r.symbol] = {
                'fund_score': r.score or 0,
                'rev_growth': data.get('revenue_growth'),
                'has_net_cash': bool(data.get('has_net_cash')),
                'is_accelerating': bool(data.get('is_accelerating')),
            }

        # 2. Get active symbols from screener universe
        symbols = [s[0] for s in db.query(ScreenerUniverse.symbol).filter(ScreenerUniverse.is_active == 1).all()]
        logger.info(f"Loaded {len(symbols)} active symbols to analyze.")

        # 3. Load all candles for active symbols
        cutoff_date = session_date - timedelta(days=120)
        logger.info("Fetching candles from database...")
        candles_raw = db.query(
            Candle.symbol, Candle.date, Candle.open, Candle.high, Candle.low, Candle.close, Candle.volume
        ).filter(Candle.date >= cutoff_date).order_by(Candle.symbol, Candle.date).all()

        candles_df = pd.DataFrame(candles_raw, columns=['symbol', 'date', 'open', 'high', 'low', 'close', 'volume'])
        candles_by_sym = {sym: g.reset_index(drop=True) for sym, g in candles_df.groupby('symbol')}

        analyzed_count = 0
        candidate_count = 0
        watch_count = 0

        for sym in symbols:
            g = candles_by_sym.get(sym)
            if g is None or len(g) < 40:
                continue

            # Format dataframe columns to match expected casing
            df_sym = pd.DataFrame({
                'Date': g['date'],
                'Open': g['open'],
                'High': g['high'],
                'Low': g['low'],
                'Close': g['close'],
                'Volume': g['volume']
            })

            fund_info = fund_map.get(sym, {})
            try:
                res = calculate_early_surf(sym, df_sym, fund_info)
                if not res:
                    continue

                analyzed_count += 1
                if res['status'] == 'candidate':
                    candidate_count += 1
                    logger.info(f"🌊 [CANDIDATE] {sym:5s} | Score: {res['score']:2d} | Close: ${res['price']:.2f} | Stop: ${res['suggested_stop']:.2f} (Risk: -{res['risk_pct']}%)")
                elif res['status'] == 'watch':
                    watch_count += 1

                # Upsert into PostgreSQL analysis_scores table
                existing_score = db.query(AnalysisScore).filter(
                    AnalysisScore.symbol == sym,
                    AnalysisScore.analysis_type == 'early_surf',
                    AnalysisScore.as_of_date == session_date
                ).first()

                if existing_score:
                    existing_score.score = res['score']
                    existing_score.status = res['status']
                    existing_score.reason = res['reason']
                    existing_score.price = res['price']
                    existing_score.created_at = utc_now_naive()
                else:
                    new_score = AnalysisScore(
                        symbol=sym,
                        analysis_type='early_surf',
                        score=res['score'],
                        status=res['status'],
                        reason=res['reason'],
                        price=res['price'],
                        created_at=utc_now_naive(),
                        as_of_date=session_date
                    )
                    db.add(new_score)

                db.commit()

            except Exception as e:
                logger.error(f"Error analyzing {sym} for Early Surf: {e}")
                db.rollback()

        logger.info(f"Early Surf Analysis completed. Analyzed: {analyzed_count} | Candidates: {candidate_count} | Watch: {watch_count}")

    finally:
        db.close()

if __name__ == '__main__':
    main()
