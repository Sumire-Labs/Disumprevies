import discord

from src.core.database.models import LogType

from ..embeds import VoiceEmbeds
from .base import send_log


async def log_voice_leave(
    bot: discord.Client,
    member: discord.Member,
    channel: discord.VoiceChannel
) -> None:
    """VC退出のログ"""
    embed = VoiceEmbeds.voice_leave(member, channel)
    await send_log(bot, member.guild.id, LogType.VOICE, embed)
