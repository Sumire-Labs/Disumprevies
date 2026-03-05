# src\cogs\automod\services\check_punishment.py
from typing import Optional

from src.core.database.models import PunishmentType


# 処分閾値の設定
PUNISHMENT_THRESHOLDS = [
    (3, PunishmentType.WARN, None),
    (5, PunishmentType.TIMEOUT, 10),       # 10分
    (8, PunishmentType.TIMEOUT, 60),       # 1時間
    (12, PunishmentType.TIMEOUT, 1440),    # 24時間
    (15, PunishmentType.KICK, None),
    (20, PunishmentType.BAN, None),
]


def check_punishment(
    total_points: int
) -> Optional[tuple[PunishmentType, Optional[int]]]:
    """ポイントに応じた処分を判定"""
    result = None

    for threshold, punishment_type, duration in PUNISHMENT_THRESHOLDS:
        if total_points >= threshold:
            result = (punishment_type, duration)

    return result
