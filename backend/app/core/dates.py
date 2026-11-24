from datetime import date, datetime
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")

_fixed_today: date | None = None  # tests only


def set_today_for_tests(value: date | None) -> None:
    global _fixed_today
    _fixed_today = value


def today() -> date:
    """The club runs on Indian time; 'this month' must not flip at 05:30 IST."""
    return _fixed_today or datetime.now(IST).date()


def month_start(d: date) -> date:
    return d.replace(day=1)


def current_month() -> date:
    return month_start(today())


def add_months(d: date, n: int) -> date:
    y, m = divmod(d.month - 1 + n, 12)
    return date(d.year + y, m + 1, 1)


def parse_month(value: str | None) -> date:
    """'2026-11' → date(2026, 11, 1). None → current month."""
    if not value:
        return current_month()
    try:
        y, m = value.split("-")[:2]
        return date(int(y), int(m), 1)
    except ValueError as e:
        raise ValueError(f"Month must look like 2026-11, got {value!r}") from e
