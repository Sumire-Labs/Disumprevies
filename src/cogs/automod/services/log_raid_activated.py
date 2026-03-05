# src/cogs/automod/services/log_raid_activated.py

from datetime import datetime

import discord

from src.core.database.models import LogType
from src.cogs.logger.services.base import send_log


async def log_raid_activated(
    bot: discord.Client,
    guild: discord.Guild,
    join_count: int
) -> None:
    """レイド発動のログを送信"""
    embed = discord.Embed(
        title="🚨 レイドプロテクション発動",
        description="短時間に大量のメンバーが参加したため、レイドプロテクションが発動しました。",
        color=discord.Color.dark_red(),
        timestamp=datetime.utcnow()
    )

    embed.add_field(
        name="検出人数",
        value=f"{join_count}人",
        inline=True
    )
    embed.add_field(
        name="状態",
        value="🔴 発動中",
        inline=True
    )
    embed.add_field(
        name="解除方法",
        value="`/settings raid off` で解除できます",
        inline=False
    )

    await send_log(bot, guild.id, LogType.MOD, embed)
