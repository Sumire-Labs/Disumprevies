# src/cogs/moderation/embeds/infractions_embed.py

from datetime import datetime, timezone

import discord

from src.core.database.models import Violation


def create_infractions_embed(
    user: discord.User | discord.Member,
    violations: list[Violation],
    total_points: int,
    show_expired: bool = False
) -> discord.Embed:
    """違反履歴一覧のEmbed生成"""
    embed = discord.Embed(
        title=f"📋 違反履歴 - {user.display_name}",
        color=discord.Color.orange() if total_points > 0 else discord.Color.green(),
        timestamp=datetime.utcnow()
    )

    embed.set_thumbnail(url=user.display_avatar.url)

    embed.add_field(
        name="現在の累計ポイント",
        value=f"**{total_points}pt**",
        inline=False
    )

    if not violations:
        embed.add_field(
            name="違反履歴",
            value="違反履歴はありません",
            inline=False
        )
    else:
        for v in violations[:10]:
            now = datetime.now(timezone.utc)
            is_expired = v.expires_at.replace(tzinfo=timezone.utc) < now
            status = "🔴 期限切れ" if is_expired else "🟢 有効"

            field_value = (
                f"種別: {v.violation_type_id}\n"
                f"ポイント: {v.points}pt\n"
                f"理由: {v.reason or '(なし)'}\n"
                f"日時: {v.created_at.strftime('%Y/%m/%d %H:%M')}\n"
                f"状態: {status}"
            )

            embed.add_field(
                name=f"ID: {v.id}",
                value=field_value,
                inline=True
            )

        if len(violations) > 10:
            embed.add_field(
                name="",
                value=f"他 {len(violations) - 10} 件",
                inline=False
            )

    embed.set_footer(text=f"ユーザーID: {user.id}")

    return embed
