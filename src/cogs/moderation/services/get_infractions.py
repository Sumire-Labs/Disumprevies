# src/cogs/moderation/services/get_infractions.py

from dataclasses import dataclass

import discord

from src.core.database.models import Violation
from src.core.database.repositories import ViolationsRepository


@dataclass
class InfractionsResult:
    violations: list[Violation]
    total_points: int


async def get_infractions(
    guild_id: int,
    user: discord.User | discord.Member,
    include_expired: bool = False
) -> InfractionsResult:
    """違反履歴を取得"""
    violations = await ViolationsRepository.get_user_violations(
        guild_id,
        user.id,
        include_expired=include_expired,
        include_deleted=False
    )

    total_points = await ViolationsRepository.get_user_total_points(guild_id, user.id)

    return InfractionsResult(violations=violations, total_points=total_points)
