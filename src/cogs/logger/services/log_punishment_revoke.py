from typing import Optional

# src\cogs\logger\services\log_punishment_revoke.py
import discord

from src.core.database.models import LogType

from ..embeds import ModEmbeds
from .base import send_log


async def log_punishment_revoke(
    bot: discord.Client,
    guild: discord.Guild,
    user: discord.Member | discord.User,
    action: str,
    moderator: Optional[discord.Member] = None,
    reason: Optional[str] = None
) -> None:
    """処分解除のログ"""
    embed = ModEmbeds.punishment_revoke(user, action, moderator, reason)
    await send_log(bot, guild.id, LogType.MOD, embed)
