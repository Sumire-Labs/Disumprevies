# src\cogs\logger\services\log_member_join.py
import discord

from src.core.database.models import LogType

from ..embeds import MemberEmbeds
from .base import send_log


async def log_member_join(
    bot: discord.Client,
    member: discord.Member
) -> None:
    """メンバー参加のログ"""
    embed = MemberEmbeds.member_join(member)
    await send_log(bot, member.guild.id, LogType.MEMBER, embed)
