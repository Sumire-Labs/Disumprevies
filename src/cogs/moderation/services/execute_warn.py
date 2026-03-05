# src/cogs/moderation/services/execute_warn.py

from dataclasses import dataclass

import discord

from src.core.database.models import PunishmentType
from src.core.database.repositories import PunishmentsRepository
from src.cogs.logger.services import log_punishment


@dataclass
class WarnResult:
    success: bool
    error_message: str | None = None


async def execute_warn(
    bot: discord.Client,
    guild: discord.Guild,
    user: discord.Member,
    moderator: discord.Member,
    reason: str
) -> WarnResult:
    """警告を実行"""
    # DM送信
    try:
        await user.send(
            f"⚠️ **警告** - {guild.name}\n\n"
            f"理由: {reason}\n"
            f"実行者: {moderator.display_name}"
        )
    except discord.Forbidden:
        pass

    # DB記録
    await PunishmentsRepository.create(
        guild_id=guild.id,
        user_id=user.id,
        punishment_type=PunishmentType.WARN,
        reason=reason,
        moderator_id=moderator.id
    )

    # ログ送信
    await log_punishment(bot, guild, user, "warn", reason, moderator)

    return WarnResult(success=True)
