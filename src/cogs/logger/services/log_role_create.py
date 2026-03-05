import discord

from src.core.database.models import LogType

from ..embeds import ServerEmbeds
from .base import send_log


async def log_role_create(
    bot: discord.Client,
    role: discord.Role
) -> None:
    """ロール作成のログ"""
    embed = ServerEmbeds.role_create(role)
    await send_log(bot, role.guild.id, LogType.SERVER, embed)
