# src\cogs\logger\services\log_channel_create.py
import discord

from src.core.database.models import LogType

from ..embeds import ServerEmbeds
from .base import send_log


async def log_channel_create(
    bot: discord.Client,
    channel: discord.abc.GuildChannel
) -> None:
    """チャンネル作成のログ"""
    embed = ServerEmbeds.channel_create(channel)
    await send_log(bot, channel.guild.id, LogType.SERVER, embed)
