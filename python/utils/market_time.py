from __future__ import annotations

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

US_EQUITY_TZ = ZoneInfo("America/New_York")


def utc_now_naive() -> datetime:
    """Naive UTC timestamp for TIMESTAMP WITHOUT TIME ZONE columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def trading_today(now: datetime | None = None) -> date:
    """
    US equity session calendar date (America/New_York).

    Miner/analysis jobs run on a Europe server; local date.today() and
    datetime.utcnow().date() disagree around midnight and do not match
    the candle dates IBKR/Yahoo stamp on US bars.
    """
    if now is None:
        now = datetime.now(timezone.utc)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    return now.astimezone(US_EQUITY_TZ).date()
