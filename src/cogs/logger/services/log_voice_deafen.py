import discord

from src.core.database.models import LogType

from ..embeds import VoiceEmbeds
from .base import send_log


async def log_voice_deafen(
    bot: discord.Client,
    member: discord.Member,
    deafened: bool,
    by_server: bool = True
) -> None:
    """VCスピーカーミュートのログ"""
    embed = VoiceEmbeds.voice_deafen(member, deafened, by_server)
    await send_log(bot, member.guild.id, LogType.VOICE, embed)
