from typing import Optional

import discord

from src.core.database.models import LogType

from ..embeds import MessageEmbeds
from .base import send_log, is_ignored


async def log_message_bulk_delete(
    bot: discord.Client,
    channel: discord.TextChannel,
    messages: list[discord.Message],
    executor: Optional[discord.Member] = None
) -> None:
    """一括メッセージ削除のログ"""
    if await is_ignored(channel.guild.id, channel_id=channel.id):
        return

    embed = MessageEmbeds.message_bulk_delete(channel, messages, executor)
    await send_log(bot, channel.guild.id, LogType.MESSAGE, embed)
