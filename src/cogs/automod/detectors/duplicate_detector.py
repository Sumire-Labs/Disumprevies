# src\cogs\automod\detectors\duplicate_detector.py
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional

import discord

from .base import DetectionResult


# ユーザーごとの直近メッセージ {guild_id: {user_id: [(content, timestamp)]}}
_recent_messages: dict[int, dict[int, list[tuple[str, datetime]]]] = defaultdict(
    lambda: defaultdict(list)
)


async def detect_duplicate(
    message: discord.Message,
    settings_cache: Optional[dict] = None
) -> DetectionResult:
    """連続投稿（同一内容）検出"""
    guild_id = message.guild.id
    user_id = message.author.id
    content = message.content.strip().lower()
    now = datetime.utcnow()

    # 空のメッセージは無視
    if not content:
        return DetectionResult(detected=False)

    # 設定を取得
    if settings_cache:
        duplicate_count = settings_cache.get("duplicate_count", 3)
        duplicate_seconds = settings_cache.get("duplicate_seconds", 30)
    else:
        duplicate_count = 3
        duplicate_seconds = 30

    # 古い履歴を削除
    cutoff = now - timedelta(seconds=duplicate_seconds)
    _recent_messages[guild_id][user_id] = [
        (c, ts) for c, ts in _recent_messages[guild_id][user_id]
        if ts > cutoff
    ]

    # 同一内容のカウント
    same_count = sum(
        1 for c, _ in _recent_messages[guild_id][user_id]
        if c == content
    )

    # 現在のメッセージを追加
    _recent_messages[guild_id][user_id].append((content, now))

    # 閾値チェック
    if same_count >= duplicate_count - 1:
        _recent_messages[guild_id][user_id].clear()
        return DetectionResult(
            detected=True,
            violation_type="duplicate",
            reason=f"同一内容のメッセージを{same_count + 1}回連続投稿"
        )

    return DetectionResult(detected=False)


def clear_user_history(guild_id: int, user_id: int) -> None:
    """ユーザーの履歴をクリア"""
    if guild_id in _recent_messages:
        _recent_messages[guild_id].pop(user_id, None)
