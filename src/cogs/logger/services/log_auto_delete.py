import discord

from src.core.database.models import LogType, MessageLogEventType
from src.core.database.repositories import MessageLogsRepository

from ..embeds import ModEmbeds
from .base import send_log


async def log_auto_delete(
    bot: discord.Client,
    message: discord.Message,
    violation_type: str,
    points: int,
    total_points: int
) -> None:
    """自動削除メッセージのログ（Discord + DB）"""
    guild_id = message.guild.id

    # Discordチャンネルに送信
    embed = ModEmbeds.auto_delete(message, violation_type, points, total_points)
    await send_log(bot, guild_id, LogType.MOD, embed)

    # DBに保存
    await MessageLogsRepository.create(
        guild_id=guild_id,
        channel_id=message.channel.id,
        message_id=message.id,
        user_id=message.author.id,
        event_type=MessageLogEventType.AUTO_DELETE,
        created_at=message.created_at,
        content=message.content,
        has_attachments=len(message.attachments) > 0,
        reason=violation_type
    )
