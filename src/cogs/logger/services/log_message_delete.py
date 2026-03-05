from typing import Optional

import discord

from src.core.database.models import LogType

from ..embeds import MessageEmbeds
from .base import send_log, is_ignored


async def log_message_delete(
    bot: discord.Client,
    message: discord.Message,
    executor: Optional[discord.Member] = None
) -> None:
    """メッセージ削除のログ"""
    if message.guild is None:
        return

    if await is_ignored(message.guild.id, channel_id=message.channel.id):
        return

    embed = MessageEmbeds.message_delete(message, executor)
    await send_log(bot, message.guild.id, LogType.MESSAGE, embed)
