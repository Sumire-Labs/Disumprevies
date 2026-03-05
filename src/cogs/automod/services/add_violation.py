# src\cogs\automod\services\add_violation.py
from datetime import datetime, timedelta

import discord

from src.core.database.repositories import (
    GuildSettingsRepository,
    ViolationTypesRepository,
    ViolationsRepository,
)


async def add_violation(
    guild_id: int,
    user_id: int,
    violation_type: str,
    reason: str,
    message_id: int = None,
    channel_id: int = None
) -> tuple[int, int]:
    """違反を記録し、(付与ポイント, 合計ポイント)を返す"""

    # 違反種別を取得
    vtype = await ViolationTypesRepository.get(guild_id, violation_type)
    if not vtype:
        # デフォルトがなければ作成
        await ViolationTypesRepository.create_defaults(guild_id)
        vtype = await ViolationTypesRepository.get(guild_id, violation_type)

    # 有効期限を計算
    settings = await GuildSettingsRepository.get(guild_id)
    expiry_days = vtype.expiry_days or (settings.point_expiry_days if settings else 30)
    expires_at = datetime.utcnow() + timedelta(days=expiry_days)

    # 違反を記録
    await ViolationsRepository.create(
        guild_id=guild_id,
        user_id=user_id,
        violation_type_id=vtype.id,
        points=vtype.default_points,
        expires_at=expires_at,
        reason=reason,
        message_id=message_id,
        channel_id=channel_id
    )

    # 合計ポイントを取得
    total_points = await ViolationsRepository.get_user_total_points(guild_id, user_id)

    return vtype.default_points, total_points
