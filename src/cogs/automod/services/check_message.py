# src\cogs\automod\services\check_message.py
from typing import Optional

import discord

from src.core.database.repositories import GuildSettingsRepository, NgWordsRepository

from ..detectors import (
    DetectionResult,
    is_whitelisted,
    detect_spam,
    detect_duplicate,
    detect_ngword,
    detect_mention,
    detect_invite,
    detect_link,
)


async def check_message(message: discord.Message) -> Optional[DetectionResult]:
    """メッセージをチェックして違反を検出"""
    guild_id = message.guild.id
    member = message.author

    # ホワイトリストチェック
    if await is_whitelisted(guild_id, member, message.channel.id):
        return None

    # 設定を取得
    settings = await GuildSettingsRepository.get(guild_id)
    if not settings:
        return None

    settings_cache = {
        "spam_count": settings.spam_count,
        "spam_seconds": settings.spam_seconds,
        "duplicate_count": settings.duplicate_count,
        "duplicate_seconds": settings.duplicate_seconds,
        "mention_limit": settings.mention_limit,
    }

    ngwords_cache = await NgWordsRepository.get_words(guild_id)

    # 各検出を順番に実行（有効な場合のみ）
    if settings.spam_enabled:
        result = await detect_spam(message, settings_cache)
        if result.detected:
            return result

    if settings.duplicate_enabled:
        result = await detect_duplicate(message, settings_cache)
        if result.detected:
            return result

    if settings.ngword_enabled:
        result = await detect_ngword(message, ngwords_cache)
        if result.detected:
            return result

    if settings.mention_enabled:
        result = await detect_mention(message, settings_cache)
        if result.detected:
            return result

    if settings.invite_enabled:
        result = await detect_invite(message)
        if result.detected:
            return result

    if settings.link_enabled:
        result = await detect_link(message)
        if result.detected:
            return result

    return None
