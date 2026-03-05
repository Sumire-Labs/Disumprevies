import re

import discord

from .base import DetectionResult


# Discord招待リンクのパターン
INVITE_PATTERN = re.compile(
    r"(discord\.gg|discord\.com/invite|discordapp\.com/invite)/[\w-]+",
    re.IGNORECASE
)


async def detect_invite(
    message: discord.Message
) -> DetectionResult:
    """招待リンク検出"""
    content = message.content

    # 招待リンクのチェック
    match = INVITE_PATTERN.search(content)
    if match:
        return DetectionResult(
            detected=True,
            violation_type="invite_link",
            reason="Discord招待リンクを投稿"
        )

    return DetectionResult(detected=False)
