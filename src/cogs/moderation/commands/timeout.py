# src/cogs/moderation/commands/timeout.py

import discord
from discord import app_commands
from discord.ext import commands

from ..utils import is_moderator, parse_duration, format_duration
from ..services import execute_timeout
from ..embeds import create_result_embed


class TimeoutCommand(commands.Cog):
    """タイムアウトコマンド"""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(name="timeout", description="ユーザーをタイムアウトします")
    @app_commands.describe(
        user="タイムアウトするユーザー",
        duration="期間（例: 10m, 1h, 1d）",
        reason="タイムアウトの理由"
    )
    @is_moderator()
    async def timeout(
        self,
        interaction: discord.Interaction,
        user: discord.Member,
        duration: str,
        reason: str
    ) -> None:
        # 自分自身へのタイムアウトを防止
        if user.id == interaction.user.id:
            await interaction.response.send_message(
                "自分自身をタイムアウトすることはできません", ephemeral=True
            )
            return

        # Bot へのタイムアウトを防止
        if user.bot:
            await interaction.response.send_message(
                "Botをタイムアウトすることはできません", ephemeral=True
            )
            return

        # 期間をパース
        td = parse_duration(duration)
        if td is None:
            await interaction.response.send_message(
                "無効な期間形式です。例: `10m`, `1h`, `1d`", ephemeral=True
            )
            return

        result = await execute_timeout(
            self.bot, interaction.guild, user, interaction.user, td, reason
        )

        embed = create_result_embed(
            action="timeout",
            user=user,
            moderator=interaction.user,
            reason=reason,
            success=result.success,
            duration=format_duration(td) if result.success else None,
            error_message=result.error_message
        )

        await interaction.response.send_message(embed=embed)
