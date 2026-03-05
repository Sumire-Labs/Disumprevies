import discord

from src.core.database.models import LogType

from ..embeds import MessageEmbeds
from .base import send_log, is_ignored


async def log_message_edit(
    bot: discord.Client,
    before: discord.Message,
    after: discord.Message
) -> None:
    """メッセージ編集のログ"""
    if before.guild is None:
        return

    if await is_ignored(before.guild.id, channel_id=before.channel.id):
        return

    # 内容が変わっていない場合はスキップ（埋め込みの更新など）
    if before.content == after.content:
        return

    embed = MessageEmbeds.message_edit(before, after)
    await send_log(bot, before.guild.id, LogType.MESSAGE, embed)
