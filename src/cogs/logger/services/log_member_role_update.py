import discord

from src.core.database.models import LogType

from ..embeds import MemberEmbeds
from .base import send_log


async def log_member_role_update(
    bot: discord.Client,
    before: discord.Member,
    after: discord.Member
) -> None:
    """ロール変更のログ"""
    added = set(after.roles) - set(before.roles)
    removed = set(before.roles) - set(after.roles)

    if not added and not removed:
        return

    embed = MemberEmbeds.role_update(after, list(added), list(removed))
    await send_log(bot, after.guild.id, LogType.MEMBER, embed)
