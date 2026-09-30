"""Normalize Yahoo/IBKR fundamental fields before they hit Postgres or scores."""
from __future__ import annotations

import math
from typing import Any, Optional


def coerce_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        if isinstance(value, str) and value.strip() == "":
            return None
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return number


def yahoo_debt_to_equity_to_ratio(raw: Any) -> Optional[float]:
    """
    Yahoo quoteSummary debtToEquity is Total Debt / Equity * 100 (percent).
    Scoring and wheelFit expect a ratio (1.5, not 150).

    Values already in ratio form (typical after a prior conversion, or IBKR)
    stay as-is. Percent-scale values (> 10) are divided by 100.
    """
    value = coerce_float(raw)
    if value is None:
        return None
    if abs(value) > 10:
        return value / 100.0
    return value


def resolve_pe(*, trailing_pe: Any, price: Any, trailing_eps: Any) -> Optional[float]:
    pe = coerce_float(trailing_pe)
    if pe is not None and pe > 0:
        return pe
    px = coerce_float(price)
    eps = coerce_float(trailing_eps)
    if px is not None and px > 0 and eps is not None and eps > 0:
        return px / eps
    return None


def resolve_peg(*, peg: Any, pe: Optional[float], earnings_growth: Any) -> Optional[float]:
    """
    Prefer Yahoo pegRatio. If missing, PEG ≈ PE / (EPS growth as percent).
    Yahoo earningsGrowth is a decimal (0.25 = 25%).
    """
    direct = coerce_float(peg)
    if direct is not None and direct > 0:
        return direct
    growth = coerce_float(earnings_growth)
    if pe is None or pe <= 0 or growth is None or growth <= 0:
        return None
    growth_pct = growth * 100.0 if abs(growth) <= 5 else growth
    if growth_pct <= 0:
        return None
    return pe / growth_pct
