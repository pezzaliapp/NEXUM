"""Time model: UTC milliseconds with explicit precision and uncertainty."""

from datetime import datetime, timezone

PRECISIONS = ("second", "minute", "hour", "day", "month", "year")

MS = 1
SECOND = 1000
MINUTE = 60 * SECOND
HOUR = 60 * MINUTE
DAY = 24 * HOUR

_UNITS = {"ms": 1, "s": SECOND, "m": MINUTE, "h": HOUR, "d": DAY, "w": 7 * DAY}


def parse_duration(text) -> int:
    """'7d', '-1h', '30m', '4500ms' → milliseconds. Integers pass through as ms."""
    if isinstance(text, (int, float)):
        return int(text)
    s = str(text).strip()
    sign = -1 if s.startswith("-") else 1
    s = s.lstrip("+-")
    for unit in ("ms", "s", "m", "h", "d", "w"):
        if s.endswith(unit) and s[: -len(unit)].replace(".", "", 1).isdigit():
            return sign * int(float(s[: -len(unit)]) * _UNITS[unit])
    raise ValueError(f"invalid duration: {text!r}")


def parse_iso(text: str) -> tuple[int, bool]:
    """Parse ISO 8601. Returns (utc_ms, timezone_was_assumed)."""
    s = text.strip().replace("Z", "+00:00")
    dt = datetime.fromisoformat(s)
    assumed = dt.tzinfo is None
    if assumed:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000), assumed


def to_iso(ms: int | None) -> str | None:
    if ms is None:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def month_index(ms: int | None) -> int | None:
    """Months since year 0: year*12 + (month-1). Stable integer bucket."""
    if ms is None:
        return None
    dt = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
    return dt.year * 12 + dt.month - 1


def month_start_ms(mi: int) -> int:
    y, m = divmod(mi, 12)
    return int(datetime(y, m + 1, 1, tzinfo=timezone.utc).timestamp() * 1000)


def year_of_month(mi: int) -> int:
    return mi // 12


def human_delta(ms: int) -> str:
    """Readable, sign-aware duration in Italian, e.g. '3 h 21 min'."""
    neg = ms < 0
    ms = abs(int(ms))
    d, rem = divmod(ms, DAY)
    h, rem = divmod(rem, HOUR)
    m, rem = divmod(rem, MINUTE)
    parts = []
    if d:
        parts.append(f"{d} {'giorno' if d == 1 else 'giorni'}")
    if h:
        parts.append(f"{h} h")
    if m and not d:
        parts.append(f"{m} min")
    if not parts:
        parts.append(f"{rem // SECOND} s")
    return ("−" if neg else "") + " ".join(parts)
