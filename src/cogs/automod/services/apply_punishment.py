from typing import Optional

import discord

from src.core.database.models import PunishmentType

from .apply_timeout import apply_timeout
from .apply_kick import apply_kick
from .apply_ban import apply_ban
from .send_warning import send_warning


async def apply_punishment(
    bot: discord.Client,
    member: discord.Member,
    punishment_type: PunishmentType,
    reason: str,
    total_points: int,
    duration_minutes: Optional[int] = None
) -> bool:
    """処分を適用"""
    try:
        match punishment_type:
            case PunishmentType.WARN:
                return await send_warning(member, reason, total_points)

            case PunishmentType.TIMEOUT:
                return await apply_timeout(
                    bot, member, duration_minutes, reason, total_points
                )

            case PunishmentType.KICK:
                return await apply_kick(bot, member, reason, total_points)

            case PunishmentType.BAN:
                return await apply_ban(bot, member, reason, total_points)

        return False

    except discord.Forbidden:
        return False
    except discord.HTTPException:
        return False
