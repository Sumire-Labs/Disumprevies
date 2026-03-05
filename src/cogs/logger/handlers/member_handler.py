# src\cogs\logger\handlers\member_handler.py
import discord
from discord.ext import commands

from ..services import (
    log_member_join,
    log_member_leave,
    log_member_role_update,
    log_member_nickname_update,
)


class MemberHandler(commands.Cog):
    """メンバー関連のイベントハンドラ"""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_member_join(self, member: discord.Member) -> None:
        """メンバー参加イベント"""
        # Botは無視
        if member.bot:
            return

        await log_member_join(self.bot, member)

    @commands.Cog.listener()
    async def on_member_remove(self, member: discord.Member) -> None:
        """メンバー退出イベント"""
        # Botは無視
        if member.bot:
            return

        await log_member_leave(self.bot, member)

    @commands.Cog.listener()
    async def on_member_update(
        self,
        before: discord.Member,
        after: discord.Member
    ) -> None:
        """メンバー更新イベント"""
        # Botは無視
        if before.bot:
            return

        # ロール変更をチェック
        if before.roles != after.roles:
            await log_member_role_update(self.bot, before, after)

        # ニックネーム変更をチェック
        if before.nick != after.nick:
            await log_member_nickname_update(self.bot, before, after)
