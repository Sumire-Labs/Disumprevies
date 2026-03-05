# src\cogs\logger\services\log_guild_update.py
import discord

from src.core.database.models import LogType

from ..embeds import ServerEmbeds
from .base import send_log


async def log_guild_update(
    bot: discord.Client,
    before: discord.Guild,
    after: discord.Guild
) -> None:
    """サーバー設定更新のログ"""
    changes = ServerEmbeds.get_guild_changes(before, after)
    if not changes:
        return

    embed = ServerEmbeds.guild_update(after, changes)
    await send_log(bot, after.id, LogType.SERVER, embed)
