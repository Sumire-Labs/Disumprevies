# src\cogs\automod\detectors\link_detector.py
import re

import discord

from .base import DetectionResult


# URLパターン
URL_PATTERN = re.compile(
    r"https?://[^\s<>\"{}|\\^`\[\]]+",
    re.IGNORECASE
)

# 許可されたドメイン
ALLOWED_DOMAINS = [
    "discord.com",
    "discordapp.com",
    "discord.gg",
    "tenor.com",
    "giphy.com",
    "imgur.com",
    "youtube.com",
    "youtu.be",
    "twitter.com",
    "x.com",
]


async def detect_link(
    message: discord.Message,
    allowed_domains: list[str] = None
) -> DetectionResult:
    """外部リンク検出"""
    content = message.content

    # URLを抽出
    urls = URL_PATTERN.findall(content)
    if not urls:
        return DetectionResult(detected=False)

    # 許可ドメインリスト
    allowed = allowed_domains or ALLOWED_DOMAINS

    # 各URLをチェック
    for url in urls:
        is_allowed = False
        for domain in allowed:
            if domain in url.lower():
                is_allowed = True
                break

        if not is_allowed:
            return DetectionResult(
                detected=True,
                violation_type="external_link",
                reason="許可されていない外部リンクを投稿"
            )

    return DetectionResult(detected=False)
