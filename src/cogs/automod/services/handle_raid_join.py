# src/cogs/automod/services/handle_raid_join.py

import discord

from src.core.database.repositories import GuildSettingsRepository
from src.cogs.logger.services import log_punishment

from ..detectors import check_raid, is_raid_active


async def handle_raid_join(
    bot: discord.Client,
    member: discord.Member
) -> bool:
    """
    メンバー参加時のレイドチェック
    Returns: True if a member was kicked due to a raid
    """
    guild = member.guild
    settings = await GuildSettingsRepository.get(guild.id)

    # レイド検出が無効の場合
    if not settings or not settings.raid_enabled:
        return False

    # 既にレイド発動中の場合は即キック
    if is_raid_active(guild.id):
        await _kick_raid_member(bot, member)
        return True

    # レイド検出
    is_raid = check_raid(
        guild.id,
        settings.raid_count,
        settings.raid_seconds
    )

    if is_raid:
        await _kick_raid_member(bot, member)
        return True

    return False


async def _kick_raid_member(
    bot: discord.Client,
    member: discord.Member
) -> None:
    """レイドメンバーをキック"""
    reason = "レイドプロテクション発動"

    try:
        # DM送信
        await member.send(
            f"**{member.guild.name}** は現在レイド対策モードのため、"
            f"参加できません。\n"
            f"しばらく時間をおいてから再度お試しください。"
        )
    except discord.Forbidden:
        pass

    try:
        await member.kick(reason=reason)
        await log_punishment(bot, member.guild, member, "kick", reason)
    except discord.Forbidden:
        pass
