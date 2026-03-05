# src/cogs/moderation/commands/addpoints.py

import discord
from discord import app_commands
from discord.ext import commands

from ..utils import is_moderator
from ..services import execute_addpoints
from ..embeds import create_result_embed


class AddpointsCommand(commands.Cog):
    """ポイント付与コマンド"""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(name="addpoints", description="ユーザーにポイントを付与します")
    @app_commands.describe(
        user="ポイントを付与するユーザー",
        points="付与するポイント数（1-100）",
        reason="付与の理由"
    )
    @is_moderator()
    async def addpoints(
        self,
        interaction: discord.Interaction,
        user: discord.Member,
        points: app_commands.Range[int, 1, 100],
        reason: str
    ) -> None:
        # 自分自身への付与を防止
        if user.id == interaction.user.id:
            await interaction.response.send_message(
                "自分自身にポイントを付与することはできません", ephemeral=True
            )
            return

        # Bot への付与を防止
        if user.bot:
            await interaction.response.send_message(
                "Botにポイントを付与することはできません", ephemeral=True
            )
            return

        result = await execute_addpoints(
            self.bot, interaction.guild, user, interaction.user, points, reason
        )

        embed = create_result_embed(
            action="addpoints",
            user=user,
            moderator=interaction.user,
            reason=reason,
            success=result.success,
            points=result.points,
            total_points=result.total_points,
            error_message=result.error_message
        )

        # 処分が適用された場合は追加情報
        if result.punishment_applied:
            embed.add_field(
                name="⚠️ 自動処分",
                value=f"累計ポイントにより `{result.punishment_applied}` が適用されました",
                inline=False
            )

        await interaction.response.send_message(embed=embed)
