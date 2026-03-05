# src/cogs/moderation/commands/warn.py

import discord
from discord import app_commands
from discord.ext import commands

from ..utils import is_moderator
from ..services import execute_warn
from ..embeds import create_result_embed


class WarnCommand(commands.Cog):
    """警告コマンド"""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(name="warn", description="ユーザーに警告を付与します")
    @app_commands.describe(user="警告するユーザー", reason="警告の理由")
    @is_moderator()
    async def warn(
        self,
        interaction: discord.Interaction,
        user: discord.Member,
        reason: str
    ) -> None:
        # 自分自身への警告を防止
        if user.id == interaction.user.id:
            await interaction.response.send_message(
                "自分自身に警告を付与することはできません", ephemeral=True
            )
            return

        # Bot への警告を防止
        if user.bot:
            await interaction.response.send_message(
                "Botに警告を付与することはできません", ephemeral=True
            )
            return

        result = await execute_warn(
            self.bot, interaction.guild, user, interaction.user, reason
        )

        embed = create_result_embed(
            action="warn",
            user=user,
            moderator=interaction.user,
            reason=reason,
            success=result.success,
            error_message=result.error_message
        )

        await interaction.response.send_message(embed=embed)
