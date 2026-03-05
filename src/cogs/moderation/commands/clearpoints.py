# src/cogs/moderation/commands/clearpoints.py

import discord
from discord import app_commands
from discord.ext import commands

from ..utils import is_admin
from ..services import execute_clearpoints
from ..embeds import create_result_embed


class ClearpointsCommand(commands.Cog):
    """ポイント全削除コマンド"""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(name="clearpoints", description="ユーザーのポイントを全てリセットします")
    @app_commands.describe(user="対象のユーザー", reason="リセットの理由")
    @is_admin()
    async def clearpoints(
        self,
        interaction: discord.Interaction,
        user: discord.User,
        reason: str = None
    ) -> None:
        result = await execute_clearpoints(
            interaction.guild.id, user, interaction.user.id
        )

        embed = create_result_embed(
            action="clearpoints",
            user=user,
            moderator=interaction.user,
            reason=reason or "理由なし",
            success=True
        )

        embed.add_field(
            name="削除件数",
            value=f"{result.cleared_count}件の違反を削除しました",
            inline=False
        )

        await interaction.response.send_message(embed=embed)
