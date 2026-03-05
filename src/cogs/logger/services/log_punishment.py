from typing import Optional

import discord

from src.core.database.models import LogType

from ..embeds import ModEmbeds
from .base import send_log


async def log_punishment(
    bot: discord.Client,
    guild: discord.Guild,
    user: discord.Member | discord.User,
    action: str,
    reason: str,
    moderator: Optional[discord.Member] = None,
    duration: Optional[str] = None
) -> None:
    """処分実行のログ"""
    embed = ModEmbeds.punishment(user, action, reason, moderator, duration)
    await send_log(bot, guild.id, LogType.MOD, embed)
