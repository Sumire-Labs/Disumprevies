from typing import Optional

import discord

from src.core.database.models import LogType

from ..embeds import ModEmbeds
from .base import send_log


async def log_violation(
    bot: discord.Client,
    guild: discord.Guild,
    user: discord.Member,
    violation_type: str,
    points: int,
    total_points: int,
    reason: str
) -> None:
    """違反検出・ポイント付与のログ"""
    embed = ModEmbeds.violation_detected(user, violation_type, points, total_points, reason)
    await send_log(bot, guild.id, LogType.MOD, embed)
