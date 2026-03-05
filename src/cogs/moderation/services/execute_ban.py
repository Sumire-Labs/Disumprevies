# src/cogs/moderation/services/execute_ban.py

from dataclasses import dataclass

import discord

from src.core.database.models import PunishmentType
from src.core.database.repositories import PunishmentsRepository
from src.cogs.logger.services import log_punishment


@dataclass
class BanResult:
    success: bool
    error_message: str | None = None


async def execute_ban(
    bot: discord.Client,
    guild: discord.Guild,
    user: discord.Member | discord.User,
    moderator: discord.Member,
    reason: str,
    delete_message_days: int = 0
) -> BanResult:
    """BANを実行"""
    # DM送信（Memberの場合のみ）
    if isinstance(user, discord.Member):
        try:
            await user.send(
                f"🔨 **BAN** - {guild.name}\n\n"
                f"あなたはサーバーからBANされました。\n"
                f"理由: {reason}"
            )
        except discord.Forbidden:
            pass

    # BAN実行
    try:
        await guild.ban(user, reason=reason, delete_message_days=delete_message_days)
    except discord.Forbidden:
        return BanResult(success=False, error_message="権限が不足しています")
    except discord.HTTPException as e:
        return BanResult(success=False, error_message=str(e))

    # DB記録
    await PunishmentsRepository.create(
        guild_id=guild.id,
        user_id=user.id,
        punishment_type=PunishmentType.BAN,
        reason=reason,
        moderator_id=moderator.id
    )

    # ログ送信
    await log_punishment(bot, guild, user, "ban", reason, moderator)

    return BanResult(success=True)
