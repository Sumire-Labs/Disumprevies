# src\cogs\automod\services\apply_kick.py
import discord

from src.core.database.models import PunishmentType
from src.core.database.repositories import PunishmentsRepository
from src.cogs.logger.services import log_punishment


async def apply_kick(
    bot: discord.Client,
    member: discord.Member,
    reason: str,
    total_points: int
) -> bool:
    """キックを適用"""
    guild = member.guild

    # DM送信（キック前に送信）
    try:
        await member.send(
            f"あなたは **{guild.name}** からキックされました。\n"
            f"理由: {reason}\n"
            f"累計ポイント: {total_points}pt"
        )
    except discord.Forbidden:
        pass

    # キック実行
    await member.kick(reason=reason)

    # DB記録
    await PunishmentsRepository.create(
        guild_id=guild.id,
        user_id=member.id,
        punishment_type=PunishmentType.KICK,
        reason=reason,
        total_points=total_points
    )

    # ログ送信
    await log_punishment(bot, guild, member, "kick", reason)

    return True
