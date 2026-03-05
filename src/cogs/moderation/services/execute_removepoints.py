# src/cogs/moderation/services/execute_removepoints.py

from dataclasses import dataclass

import discord

from src.core.database.repositories import ViolationsRepository


@dataclass
class RemovepointsResult:
    success: bool
    removed_points: int
    total_points: int
    error_message: str | None = None


async def execute_removepoints(
    guild_id: int,
    user: discord.User | discord.Member,
    violation_id: int,
    moderator_id: int
) -> RemovepointsResult:
    """特定の違反を削除"""
    # 違反を取得
    violation = await ViolationsRepository.get(violation_id)

    if not violation:
        return RemovepointsResult(
            success=False,
            removed_points=0,
            total_points=0,
            error_message="指定された違反IDが見つかりません"
        )

    if violation.guild_id != guild_id:
        return RemovepointsResult(
            success=False,
            removed_points=0,
            total_points=0,
            error_message="このサーバーの違反ではありません"
        )

    if violation.user_id != user.id:
        return RemovepointsResult(
            success=False,
            removed_points=0,
            total_points=0,
            error_message="指定されたユーザーの違反ではありません"
        )

    if violation.is_deleted:
        return RemovepointsResult(
            success=False,
            removed_points=0,
            total_points=0,
            error_message="この違反は既に削除されています"
        )

    # 削除実行
    await ViolationsRepository.delete(violation_id, moderator_id)

    # 合計ポイントを再取得
    total_points = await ViolationsRepository.get_user_total_points(guild_id, user.id)

    return RemovepointsResult(
        success=True,
        removed_points=violation.points,
        total_points=total_points
    )
