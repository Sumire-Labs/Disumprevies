# src/cogs/moderation/commands/kick.py

import discord
from discord import app_commands
from discord.ext import commands

from ..utils import is_moderator
from ..services import execute_kick
from ..embeds import create_result_embed


class KickCommand(commands.Cog):
    """キックコマンド"""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(name="kick", description="ユーザーをキックします")
    @app_commands.describe(user="キックするユーザー", reason="キックの理由")
    @is_moderator()
    async def kick(
        self,
        interaction: discord.Interaction,
        user: discord.Member,
        reason: str
    ) -> None:
        # 自分自身へのキックを防止
        if user.id == interaction.user.id:
            await interaction.response.send_message(
                "自分自身をキックすることはできません", ephemeral=True
            )
            return

        # Bot へのキックを防止
        if user.bot:
            await interaction.response.send_message(
                "Botをキックすることはできません", ephemeral=True
            )
            return

        result = await execute_kick(
            self.bot, interaction.guild, user, interaction.user, reason
        )

        embed = create_result_embed(
            action="kick",
            user=user,
            moderator=interaction.user,
            reason=reason,
            success=result.success,
            error_message=result.error_message
        )

        await interaction.response.send_message(embed=embed)
