from typing import Optional

import discord

from src.core.database.models import LogType

from ..embeds import MemberEmbeds
from .base import send_log


async def log_member_leave(
    bot: discord.Client,
    member: discord.Member,
    reason: Optional[str] = None
) -> None:
    """メンバー退出のログ"""
    embed = MemberEmbeds.member_leave(member, reason)
    await send_log(bot, member.guild.id, LogType.MEMBER, embed)
