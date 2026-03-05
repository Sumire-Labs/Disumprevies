# src/cogs/moderation/commands/unban.py

import discord
from discord import app_commands
from discord.ext import commands

from ..utils import is_admin
from ..services import execute_unban
from ..embeds import create_result_embed


class UnbanCommand(commands.Cog):
    """BAN解除コマンド"""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(name="unban", description="ユーザーのBANを解除します")
    @app_commands.describe(user_id="BAN解除するユーザーID", reason="解除の理由")
    @is_admin()
    async def unban(
        self,
        interaction: discord.Interaction,
        user_id: str,
        reason: str = None
    ) -> None:
        # user_id を int に変換
        try:
            uid = int(user_id)
        except ValueError:
            await interaction.response.send_message(
                "無効なユーザーIDです", ephemeral=True
            )
            return

        result = await execute_unban(
            self.bot, interaction.guild, uid, interaction.user, reason
        )

        if not result.success:
            await interaction.response.send_message(
                f"❌ BAN解除に失敗しました: {result.error_message}",
                ephemeral=True
            )
            return

        embed = create_result_embed(
            action="unban",
            user=result.user,
            moderator=interaction.user,
            reason=reason or "理由なし",
            success=True
        )

        await interaction.response.send_message(embed=embed)
