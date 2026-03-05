# src\cogs\logger\services\log_role_update.py
import discord

from src.core.database.models import LogType

from ..embeds import ServerEmbeds
from .base import send_log


async def log_role_update(
    bot: discord.Client,
    before: discord.Role,
    after: discord.Role
) -> None:
    """ロール更新のログ"""
    changes = ServerEmbeds.get_role_changes(before, after)
    if not changes:
        return

    embed = ServerEmbeds.role_update(after, changes)
    await send_log(bot, after.guild.id, LogType.SERVER, embed)
