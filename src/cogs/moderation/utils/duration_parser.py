# src/cogs/moderation/utils/duration_parser.py

import re
from datetime import timedelta
from typing import Optional


DURATION_PATTERN = re.compile(r"^(\d+)([smhdw])$", re.IGNORECASE)

UNIT_MAP = {
    "s": "seconds",
    "m": "minutes",
    "h": "hours",
    "d": "days",
    "w": "weeks",
}


def parse_duration(duration_str: str) -> Optional[timedelta]:
    """
    期間文字列をtimedeltaに変換
    例: "10m" -> 10分, "1h" -> 1時間, "1d" -> 1日
    """
    match = DURATION_PATTERN.match(duration_str.strip())
    if not match:
        return None

    value = int(match.group(1))
    unit = match.group(2).lower()

    if unit not in UNIT_MAP:
        return None

    return timedelta(**{UNIT_MAP[unit]: value})


def format_duration(td: timedelta) -> str:
    """timedeltaを読みやすい形式に変換"""
    total_seconds = int(td.total_seconds())

    if total_seconds < 60:
        return f"{total_seconds}秒"
    elif total_seconds < 3600:
        return f"{total_seconds // 60}分"
    elif total_seconds < 86400:
        return f"{total_seconds // 3600}時間"
    else:
        return f"{total_seconds // 86400}日"
