# src\cogs\automod\detectors\spam_detector.py
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional

import discord

from src.core.database.repositories import GuildSettingsRepository

from .base import DetectionResult


# ユーザーごとのメッセージ履歴 {guild_id: {user_id: [timestamps]}}
_message_history: dict[int, dict[int, list[datetime]]] = defaultdict(
    lambda: defaultdict(list)
)


async def detect_spam(
    message: discord.Message,
    settings_cache: Optional[dict] = None
) -> DetectionResult:
    """スパム検出"""
    guild_id = message.guild.id
    user_id = message.author.id
    now = datetime.utcnow()

    # 設定を取得
    if settings_cache:
        spam_count = settings_cache.get("spam_count", 5)
        spam_seconds = settings_cache.get("spam_seconds", 5)
    else:
        settings = await GuildSettingsRepository.get(guild_id)
        spam_count = settings.spam_count if settings else 5
        spam_seconds = settings.spam_seconds if settings else 5

    # 古い履歴を削除
    cutoff = now - timedelta(seconds=spam_seconds)
    _message_history[guild_id][user_id] = [
        ts for ts in _message_history[guild_id][user_id]
        if ts > cutoff
    ]

    # 現在のメッセージを追加
    _message_history[guild_id][user_id].append(now)

    # 閾値チェック
    count = len(_message_history[guild_id][user_id])
    if count >= spam_count:
        # 検出後は履歴をクリア
        _message_history[guild_id][user_id].clear()
        return DetectionResult(
            detected=True,
            violation_type="spam",
            reason=f"{spam_seconds}秒以内に{count}件のメッセージを送信"
        )

    return DetectionResult(detected=False)


def clear_user_history(guild_id: int, user_id: int) -> None:
    """ユーザーの履歴をクリア"""
    if guild_id in _message_history:
        _message_history[guild_id].pop(user_id, None)
