import discord

from src.core.database.models import LogType

from ..embeds import VoiceEmbeds
from .base import send_log


async def log_voice_move(
    bot: discord.Client,
    member: discord.Member,
    before: discord.VoiceChannel,
    after: discord.VoiceChannel
) -> None:
    """VC移動のログ"""
    embed = VoiceEmbeds.voice_move(member, before, after)
    await send_log(bot, member.guild.id, LogType.VOICE, embed)
