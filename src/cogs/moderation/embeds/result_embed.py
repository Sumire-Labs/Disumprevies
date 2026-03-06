# src/cogs/moderation/embeds/result_embed.py

from datetime import datetime, timezone
from typing import Optional

import discord


def create_result_embed(
    action: str,
    user: discord.User | discord.Member,
    moderator: discord.Member,
    reason: str,
    success: bool = True,
    duration: Optional[str] = None,
    points: Optional[int] = None,
    total_points: Optional[int] = None,
    error_message: Optional[str] = None
) -> discord.Embed:
    """コマンド実行結果のEmbed生成"""
    if success:
        color_map = {
            "warn": discord.Color.yellow(),
            "timeout": discord.Color.orange(),
            "kick": discord.Color.red(),
            "ban": discord.Color.dark_red(),
            "unban": discord.Color.green(),
            "addpoints": discord.Color.orange(),
            "removepoints": discord.Color.green(),
            "clearpoints": discord.Color.green(),
        }
        emoji_map = {
            "warn": "⚠️",
            "timeout": "🔇",
            "kick": "👢",
            "ban": "🔨",
            "unban": "✅",
            "addpoints": "➕",
            "removepoints": "➖",
            "clearpoints": "🗑️",
        }
        title = f"{emoji_map.get(action, '✅')} {action.upper()} 完了"
        color = color_map.get(action, discord.Color.green())
    else:
        title = f"❌ {action.upper()} 失敗"
        color = discord.Color.greyple()

    embed = discord.Embed(
        title=title,
        color=color,
        timestamp=datetime.now(timezone.utc)
    )

    embed.add_field(
        name="対象ユーザー",
        value=f"{user.mention} (`{user.id}`)",
        inline=True
    )
    embed.add_field(
        name="実行者",
        value=moderator.mention,
        inline=True
    )

    if duration:
        embed.add_field(
            name="期間",
            value=duration,
            inline=True
        )

    if points is not None:
        embed.add_field(
            name="ポイント",
            value=f"{'+' if points > 0 else ''}{points}pt",
            inline=True
        )

    if total_points is not None:
        embed.add_field(
            name="累計ポイント",
            value=f"{total_points}pt",
            inline=True
        )

    embed.add_field(
        name="理由",
        value=reason,
        inline=False
    )

    if error_message:
        embed.add_field(
            name="エラー",
            value=error_message,
            inline=False
        )

    embed.set_thumbnail(url=user.display_avatar.url)

    return embed
