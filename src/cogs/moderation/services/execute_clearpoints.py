# src/cogs/moderation/services/execute_clearpoints.py

from dataclasses import dataclass

import discord

from src.core.database.repositories import ViolationsRepository


@dataclass
class ClearpointsResult:
    success: bool
    cleared_count: int
    error_message: str | None = None


async def execute_clearpoints(
    guild_id: int,
    user: discord.User | discord.Member,
    moderator_id: int
) -> ClearpointsResult:
    """全違反を削除"""
    # 削除実行
    cleared_count = await ViolationsRepository.clear_user_violations(
        guild_id, user.id, moderator_id
    )

    return ClearpointsResult(success=True, cleared_count=cleared_count)
