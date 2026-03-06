# src/cogs/moderation/services/execute_timeout.py

from dataclasses import dataclass
from datetime import timedelta, datetime, timezone

import discord

from src.core.database.models import PunishmentType
from src.core.database.repositories import PunishmentsRepository
from src.cogs.logger.services import log_punishment
from ..utils import format_duration


@dataclass
class TimeoutResult:
    success: bool
    error_message: str | None = None


async def execute_timeout(
    bot: discord.Client,
    guild: discord.Guild,
    user: discord.Member,
    moderator: discord.Member,
    duration: timedelta,
    reason: str
) -> TimeoutResult:
    """タイムアウトを実行"""
    try:
        await user.timeout(duration, reason=reason)
    except discord.Forbidden:
        return TimeoutResult(success=False, error_message="権限が不足しています")
    except discord.HTTPException as e:
        return TimeoutResult(success=False, error_message=str(e))

    # DB記録
    duration_minutes = int(duration.total_seconds() / 60)
    expires_at = (datetime.now(timezone.utc) + duration).replace(tzinfo=None)

    await PunishmentsRepository.create(
        guild_id=guild.id,
        user_id=user.id,
        punishment_type=PunishmentType.TIMEOUT,
        reason=reason,
        duration_minutes=duration_minutes,
        moderator_id=moderator.id,
        expires_at=expires_at
    )

    # ログ送信
    duration_str = format_duration(duration)
    await log_punishment(bot, guild, user, "timeout", reason, moderator, duration_str)

    return TimeoutResult(success=True)
