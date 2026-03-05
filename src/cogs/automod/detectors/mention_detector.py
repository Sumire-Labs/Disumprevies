from typing import Optional

import discord

from src.core.database.repositories import GuildSettingsRepository

from .base import DetectionResult


async def detect_mention(
    message: discord.Message,
    settings_cache: Optional[dict] = None
) -> DetectionResult:
    """メンション爆撃検出"""
    guild_id = message.guild.id

    # 設定を取得
    if settings_cache:
        mention_limit = settings_cache.get("mention_limit", 10)
    else:
        settings = await GuildSettingsRepository.get(guild_id)
        mention_limit = settings.mention_limit if settings else 10

    # @everyone, @here のチェック
    if message.mention_everyone:
        return DetectionResult(
            detected=True,
            violation_type="mention_bomb",
            reason="@everyone または @here を使用"
        )

    # ユーザーメンション数のチェック
    mention_count = len(message.mentions)
    if mention_count >= mention_limit:
        return DetectionResult(
            detected=True,
            violation_type="mention_bomb",
            reason=f"{mention_count}人にメンション"
        )

    # ロールメンション数のチェック
    role_mention_count = len(message.role_mentions)
    if role_mention_count >= mention_limit:
        return DetectionResult(
            detected=True,
            violation_type="mention_bomb",
            reason=f"{role_mention_count}個のロールにメンション"
        )

    return DetectionResult(detected=False)
