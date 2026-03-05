import discord

from src.core.database.models import LogType

from ..embeds import ServerEmbeds
from .base import send_log


async def log_channel_delete(
    bot: discord.Client,
    channel: discord.abc.GuildChannel
) -> None:
    """チャンネル削除のログ"""
    embed = ServerEmbeds.channel_delete(channel)
    await send_log(bot, channel.guild.id, LogType.SERVER, embed)
