# src\cogs\logger\services\log_role_delete.py
import discord

from src.core.database.models import LogType

from ..embeds import ServerEmbeds
from .base import send_log


async def log_role_delete(
    bot: discord.Client,
    role: discord.Role
) -> None:
    """ロール削除のログ"""
    embed = ServerEmbeds.role_delete(role)
    await send_log(bot, role.guild.id, LogType.SERVER, embed)
