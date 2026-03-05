# src/cogs/automod/services/log_new_account.py

from datetime import datetime

import discord

from src.core.database.models import LogType
from src.cogs.logger.services.base import send_log


async def log_new_account(
    bot: discord.Client,
    member: discord.Member,
    account_age_days: int,
    threshold_days: int,
    created_at: datetime
) -> None:
    """新規アカウント警告ログを送信"""
    embed = discord.Embed(
        title="⚠️ 新規アカウント参加",
        color=discord.Color.yellow(),
        timestamp=datetime.utcnow()
    )

    embed.add_field(
        name="ユーザー",
        value=f"{member.mention} (`{member.id}`)",
        inline=True
    )
    embed.add_field(
        name="ユーザー名",
        value=str(member),
        inline=True
    )
    embed.add_field(
        name="アカウント作成日",
        value=created_at.strftime("%Y/%m/%d %H:%M"),
        inline=True
    )
    embed.add_field(
        name="作成からの日数",
        value=f"{account_age_days}日",
        inline=True
    )
    embed.add_field(
        name="制限閾値",
        value=f"{threshold_days}日未満",
        inline=True
    )
    embed.add_field(
        name="💡 注意",
        value="このユーザーは新規アカウントです。\n荒らしの可能性がある場合は対応を検討してください。",
        inline=False
    )

    embed.set_thumbnail(url=member.display_avatar.url)
    embed.set_footer(text=f"ユーザーID: {member.id}")

    await send_log(bot, member.guild.id, LogType.MOD, embed)
