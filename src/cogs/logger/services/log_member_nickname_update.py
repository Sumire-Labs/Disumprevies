import discord

from src.core.database.models import LogType

from ..embeds import MemberEmbeds
from .base import send_log


async def log_member_nickname_update(
    bot: discord.Client,
    before: discord.Member,
    after: discord.Member
) -> None:
    """ニックネーム変更のログ"""
    if before.nick == after.nick:
        return

    embed = MemberEmbeds.nickname_update(after, before.nick, after.nick)
    await send_log(bot, after.guild.id, LogType.MEMBER, embed)
