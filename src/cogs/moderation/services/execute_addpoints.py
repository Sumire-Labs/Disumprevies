# src/cogs/moderation/services/execute_addpoints.py

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import discord

from src.core.database.repositories import (
    GuildSettingsRepository,
    ViolationsRepository,
    ViolationTypesRepository,
)
from src.cogs.automod.services import check_punishment, apply_punishment
from src.cogs.logger.services import log_violation


@dataclass
class AddpointsResult:
    success: bool
    points: int
    total_points: int
    punishment_applied: Optional[str] = None
    error_message: str | None = None


async def execute_addpoints(
    bot: discord.Client,
    guild: discord.Guild,
    user: discord.Member,
    moderator: discord.Member,
    points: int,
    reason: str
) -> AddpointsResult:
    """ポイントを手動付与"""
    # 設定を取得
    settings = await GuildSettingsRepository.get_or_create(guild.id)
    expiry_days = settings.point_expiry_days if settings else 30

    # 有効期限を計算
    expires_at = (datetime.now(timezone.utc) + timedelta(days=expiry_days)).replace(tzinfo=None)

    # manual違反タイプを取得または作成
    vtype = await ViolationTypesRepository.get(guild.id, "manual")
    if not vtype:
        await ViolationTypesRepository.create_defaults(guild.id)
        vtype = await ViolationTypesRepository.get(guild.id, "manual")

    # 違反タイプがまだない場合は手動で作成
    if not vtype:
        from src.core.database.models import ViolationType
        vtype = await ViolationTypesRepository.create(
            ViolationType(
                guild_id=guild.id,
                name="manual",
                display_name="手動付与",
                default_points=1
            )
        )

    # 違反を記録
    await ViolationsRepository.create(
        guild_id=guild.id,
        user_id=user.id,
        violation_type_id=vtype.id,
        points=points,
        expires_at=expires_at,
        reason=reason,
        moderator_id=moderator.id
    )

    # 合計ポイントを取得
    total_points = await ViolationsRepository.get_user_total_points(guild.id, user.id)

    # ログ送信
    await log_violation(bot, guild, user, "手動付与", points, total_points, reason)

    # 処分判定
    punishment_applied = None
    punishment = check_punishment(total_points)
    if punishment:
        punishment_type, duration = punishment
        await apply_punishment(
            bot, user, punishment_type, reason, total_points, duration
        )
        punishment_applied = punishment_type.value

    return AddpointsResult(
        success=True,
        points=points,
        total_points=total_points,
        punishment_applied=punishment_applied
    )
