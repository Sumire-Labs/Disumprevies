import discord

from src.core.database.models import PunishmentType
from src.core.database.repositories import PunishmentsRepository


async def send_warning(
    member: discord.Member,
    reason: str,
    total_points: int
) -> bool:
    """警告DMを送信"""
    try:
        await member.send(
            f"⚠️ **警告** - {member.guild.name}\n\n"
            f"理由: {reason}\n"
            f"現在の累計ポイント: {total_points}pt\n\n"
            f"これ以上の違反は、タイムアウトやキック等の処分につながる可能性があります。"
        )

        # DB記録
        await PunishmentsRepository.create(
            guild_id=member.guild.id,
            user_id=member.id,
            punishment_type=PunishmentType.WARN,
            reason=reason,
            total_points=total_points
        )

        return True

    except discord.Forbidden:
        return False
