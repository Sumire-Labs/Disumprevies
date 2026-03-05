# src/cogs/automod/services/log_raid_deactivated.py

from datetime import datetime
from typing import Optional

import discord

from src.core.database.models import LogType
from src.cogs.logger.services.base import send_log


async def log_raid_deactivated(
    bot: discord.Client,
    guild: discord.Guild,
    deactivated_by: Optional[discord.Member] = None
) -> None:
    """レイド解除のログを送信"""
    embed = discord.Embed(
        title="✅ レイドプロテクション解除",
        description="レイドプロテクションが解除されました。",
        color=discord.Color.green(),
        timestamp=datetime.utcnow()
    )

    embed.add_field(
        name="状態",
        value="🟢 通常",
        inline=True
    )

    if deactivated_by:
        embed.add_field(
            name="解除者",
            value=deactivated_by.mention,
            inline=True
        )

    await send_log(bot, guild.id, LogType.MOD, embed)
