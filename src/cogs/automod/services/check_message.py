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
    """メッセージを検出してチェック"""
    guild_id = message.guild.id
    member = message.author

    # ホワイトリストチェック
    if await is_whitelisted(guild_id, member, message.channel.id):
        return None

    # 設定とNGワードをキャッシュとして取得
    settings = await GuildSettingsRepository.get(guild_id)
    settings_cache = {
        "spam_count": settings.spam_count if settings else 5,
        "spam_seconds": settings.spam_seconds if settings else 5,
        "mention_limit": settings.mention_limit if settings else 10,
    } if settings else {}

    ngwords_cache = await NgWordsRepository.get_words(guild_id)

    # 各検出を順番に実行
    detectors = [
        detect_spam(message, settings_cache),
        detect_duplicate(message),
        detect_ngword(message, ngwords_cache),
        detect_mention(message, settings_cache),
        detect_invite(message),
        detect_link(message),
    ]

    for detector in detectors:
        result = await detector
        if result.detected:
            return result

    return None
