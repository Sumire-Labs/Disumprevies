# src/cogs/automod/detectors/raid_detector.py

from collections import defaultdict
from datetime import datetime, timedelta
from dataclasses import dataclass
from typing import Optional

import discord


@dataclass
class RaidStatus:
    """レイド状態"""
    is_active: bool = False
    activated_at: Optional[datetime] = None
    join_count: int = 0


# サーバーごとの参加履歴 {guild_id: [timestamps]}
_join_history: dict[int, list[datetime]] = defaultdict(list)

# サーバーごとのレイド状態 {guild_id: RaidStatus}
_raid_status: dict[int, RaidStatus] = defaultdict(RaidStatus)


def check_raid(
    guild_id: int,
    raid_count: int,
    raid_seconds: int
) -> bool:
    """レイドを検出"""
    now = datetime.utcnow()

    # 古い履歴を削除
    cutoff = now - timedelta(seconds=raid_seconds)
    _join_history[guild_id] = [
        ts for ts in _join_history[guild_id]
        if ts > cutoff
    ]

    # 現在の参加を追加
    _join_history[guild_id].append(now)

    # 閾値チェック
    count = len(_join_history[guild_id])
    if count >= raid_count:
        # レイド発動
        _raid_status[guild_id] = RaidStatus(
            is_active=True,
            activated_at=now,
            join_count=count
        )
        return True

    return False


def is_raid_active(guild_id: int) -> bool:
    """レイドが発動中かどうか"""
    return _raid_status.get(guild_id, RaidStatus()).is_active


def get_raid_status(guild_id: int) -> RaidStatus:
    """レイド状態を取得"""
    return _raid_status.get(guild_id, RaidStatus())


def activate_raid(guild_id: int) -> None:
    """レイドを手動で発動"""
    _raid_status[guild_id] = RaidStatus(
        is_active=True,
        activated_at=datetime.utcnow(),
        join_count=0
    )


def deactivate_raid(guild_id: int) -> None:
    """レイドを解除"""
    _raid_status[guild_id] = RaidStatus()
    _join_history[guild_id].clear()


def clear_join_history(guild_id: int) -> None:
    """参加履歴をクリア"""
    _join_history[guild_id].clear()
