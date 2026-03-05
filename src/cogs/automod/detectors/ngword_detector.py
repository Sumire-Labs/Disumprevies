# src\cogs\automod\detectors\ngword_detector.py
from typing import Optional

import discord

from src.core.database.repositories import NgWordsRepository

from .base import DetectionResult


async def detect_ngword(
    message: discord.Message,
    ngwords_cache: Optional[list[str]] = None
) -> DetectionResult:
    """NGワード検出"""
    guild_id = message.guild.id
    content = message.content.lower()

    # NGワードリストを取得
    if ngwords_cache is not None:
        ngwords = ngwords_cache
    else:
        ngwords = await NgWordsRepository.get_words(guild_id)

    # 空の場合はスキップ
    if not ngwords:
        return DetectionResult(detected=False)

    # NGワードチェック
    for word in ngwords:
        if word in content:
            return DetectionResult(
                detected=True,
                violation_type="ngword",
                reason=f"NGワード「{word}」を使用"
            )

    return DetectionResult(detected=False)
