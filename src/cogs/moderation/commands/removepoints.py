# src/cogs/moderation/commands/removepoints.py

import discord
from discord import app_commands
from discord.ext import commands

from ..utils import is_moderator
from ..services import execute_removepoints
from ..embeds import create_result_embed


class RemovepointsCommand(commands.Cog):
    """ポイント削除コマンド"""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(name="removepoints", description="特定の違反ポイントを削除します")
    @app_commands.describe(
        user="対象のユーザー",
        violation_id="削除する違反ID"
    )
    @is_moderator()
    async def removepoints(
        self,
        interaction: discord.Interaction,
        user: discord.User,
        violation_id: int
    ) -> None:
        result = await execute_removepoints(
            interaction.guild.id, user, violation_id, interaction.user.id
        )

        if not result.success:
            await interaction.response.send_message(
                f"❌ 削除に失敗しました: {result.error_message}",
                ephemeral=True
            )
            return

        embed = create_result_embed(
            action="removepoints",
            user=user,
            moderator=interaction.user,
            reason=f"違反ID {violation_id} を削除",
            success=True,
            points=-result.removed_points,
            total_points=result.total_points
        )

        await interaction.response.send_message(embed=embed)
