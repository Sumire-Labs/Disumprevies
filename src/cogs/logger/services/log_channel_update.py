import discord

from src.core.database.models import LogType

from ..embeds import ServerEmbeds
from .base import send_log


async def log_channel_update(
    bot: discord.Client,
    before: discord.abc.GuildChannel,
    after: discord.abc.GuildChannel
) -> None:
    """チャンネル更新のログ"""
    changes = ServerEmbeds.get_channel_changes(before, after)
    if not changes:
        return

    embed = ServerEmbeds.channel_update(after, changes)
    await send_log(bot, after.guild.id, LogType.SERVER, embed)
