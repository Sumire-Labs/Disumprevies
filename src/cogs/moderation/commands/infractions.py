# src/cogs/moderation/commands/infractions.py

import discord
from discord import app_commands
from discord.ext import commands

from ..utils import is_moderator
from ..services import get_infractions
from ..embeds import create_infractions_embed


class InfractionsCommand(commands.Cog):
    """違反履歴コマンド"""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(name="infractions", description="ユーザーの違反履歴を表示します")
    @app_commands.describe(
        user="確認するユーザー",
        show_expired="期限切れの違反も表示する"
    )
    @is_moderator()
    async def infractions(
        self,
        interaction: discord.Interaction,
        user: discord.User,
        show_expired: bool = False
    ) -> None:
        result = await get_infractions(
            interaction.guild.id, user, include_expired=show_expired
        )

        embed = create_infractions_embed(
            user=user,
            violations=result.violations,
            total_points=result.total_points,
            show_expired=show_expired
        )

        await interaction.response.send_message(embed=embed)
