# src\cogs\logger\services\log_voice_mute.py
import discord

from src.core.database.models import LogType

from ..embeds import VoiceEmbeds
from .base import send_log


async def log_voice_mute(
    bot: discord.Client,
    member: discord.Member,
    muted: bool,
    by_server: bool = True
) -> None:
    """VCミュートのログ"""
    embed = VoiceEmbeds.voice_mute(member, muted, by_server)
    await send_log(bot, member.guild.id, LogType.VOICE, embed)
