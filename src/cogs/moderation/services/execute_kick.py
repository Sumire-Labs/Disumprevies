# src/cogs/moderation/services/execute_kick.py

from dataclasses import dataclass

import discord

from src.core.database.models import PunishmentType
from src.core.database.repositories import PunishmentsRepository
from src.cogs.logger.services import log_punishment


@dataclass
class KickResult:
    success: bool
    error_message: str | None = None


async def execute_kick(
    bot: discord.Client,
    guild: discord.Guild,
    user: discord.Member,
    moderator: discord.Member,
    reason: str
) -> KickResult:
    """キックを実行"""
    # DM送信
    try:
        await user.send(
            f"👢 **キック** - {guild.name}\n\n"
            f"あなたはサーバーからキックされました。\n"
            f"理由: {reason}"
        )
    except discord.Forbidden:
        pass

    # キック実行
    try:
        await user.kick(reason=reason)
    except discord.Forbidden:
        return KickResult(success=False, error_message="権限が不足しています")
    except discord.HTTPException as e:
        return KickResult(success=False, error_message=str(e))

    # DB記録
    await PunishmentsRepository.create(
        guild_id=guild.id,
        user_id=user.id,
        punishment_type=PunishmentType.KICK,
        reason=reason,
        moderator_id=moderator.id
    )

    # ログ送信
    await log_punishment(bot, guild, user, "kick", reason, moderator)

    return KickResult(success=True)
