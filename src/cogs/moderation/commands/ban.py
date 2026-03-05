# src/cogs/moderation/commands/ban.py

import discord
from discord import app_commands
from discord.ext import commands

from ..utils import is_admin
from ..services import execute_ban
from ..embeds import create_result_embed


class BanCommand(commands.Cog):
    """BANコマンド"""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(name="ban", description="ユーザーをBANします")
    @app_commands.describe(
        user="BANするユーザー",
        reason="BANの理由",
        delete_days="メッセージ削除日数（0-7）"
    )
    @is_admin()
    async def ban(
        self,
        interaction: discord.Interaction,
        user: discord.Member,
        reason: str,
        delete_days: app_commands.Range[int, 0, 7] = 0
    ) -> None:
        # 自分自身へのBANを防止
        if user.id == interaction.user.id:
            await interaction.response.send_message(
                "自分自身をBANすることはできません", ephemeral=True
            )
            return

        # Bot へのBANを防止
        if user.bot:
            await interaction.response.send_message(
                "BotをBANすることはできません", ephemeral=True
            )
            return

        result = await execute_ban(
            self.bot, interaction.guild, user, interaction.user, reason, delete_days
        )

        embed = create_result_embed(
            action="ban",
            user=user,
            moderator=interaction.user,
            reason=reason,
            success=result.success,
            error_message=result.error_message
        )

        await interaction.response.send_message(embed=embed)
