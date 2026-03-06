# src\cogs\automod\services\apply_timeout.py
from datetime import timedelta, datetime, timezone

import discord

from src.core.database.models import PunishmentType
from src.core.database.repositories import PunishmentsRepository
from src.cogs.logger.services import log_punishment


async def apply_timeout(
    bot: discord.Client,
    member: discord.Member,
    duration_minutes: int,
    reason: str,
    total_points: int
) -> bool:
    """タイムアウトを適用"""
    duration = timedelta(minutes=duration_minutes)
    expires_at = (datetime.now(timezone.utc) + duration).replace(tzinfo=None)

    # タイムアウト実行
    await member.timeout(duration, reason=reason)

    # DB記録
    await PunishmentsRepository.create(
        guild_id=member.guild.id,
        user_id=member.id,
        punishment_type=PunishmentType.TIMEOUT,
        reason=reason,
        duration_minutes=duration_minutes,
        total_points=total_points,
        expires_at=expires_at
    )

    # ログ送信
    duration_str = _format_duration(duration_minutes)
    await log_punishment(
        bot, member.guild, member,
        "timeout", reason, duration=duration_str
    )

    return True


def _format_duration(minutes: int) -> str:
    """分を読みやすい形式に変換"""
    if minutes < 60:
        return f"{minutes}分"
    elif minutes < 1440:
        return f"{minutes // 60}時間"
    else:
        return f"{minutes // 1440}日"
