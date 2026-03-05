# src\cogs\logger\handlers\server_handler.py
import discord
from discord.ext import commands

from ..services import (
    log_channel_create,
    log_channel_delete,
    log_channel_update,
    log_role_create,
    log_role_delete,
    log_role_update,
    log_guild_update,
)


class ServerHandler(commands.Cog):
    """サーバー関連のイベントハンドラ"""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    # === チャンネル関連 ===

    @commands.Cog.listener()
    async def on_guild_channel_create(
        self,
        channel: discord.abc.GuildChannel
    ) -> None:
        """チャンネル作成イベント"""
        await log_channel_create(self.bot, channel)

    @commands.Cog.listener()
    async def on_guild_channel_delete(
        self,
        channel: discord.abc.GuildChannel
    ) -> None:
        """チャンネル削除イベント"""
        await log_channel_delete(self.bot, channel)

    @commands.Cog.listener()
    async def on_guild_channel_update(
        self,
        before: discord.abc.GuildChannel,
        after: discord.abc.GuildChannel
    ) -> None:
        """チャンネル更新イベント"""
        await log_channel_update(self.bot, before, after)

    # === ロール関連 ===

    @commands.Cog.listener()
    async def on_guild_role_create(self, role: discord.Role) -> None:
        """ロール作成イベント"""
        await log_role_create(self.bot, role)

    @commands.Cog.listener()
    async def on_guild_role_delete(self, role: discord.Role) -> None:
        """ロール削除イベント"""
        await log_role_delete(self.bot, role)

    @commands.Cog.listener()
    async def on_guild_role_update(
        self,
        before: discord.Role,
        after: discord.Role
    ) -> None:
        """ロール更新イベント"""
        await log_role_update(self.bot, before, after)

    # === サーバー設定 ===

    @commands.Cog.listener()
    async def on_guild_update(
        self,
        before: discord.Guild,
        after: discord.Guild
    ) -> None:
        """サーバー設定更新イベント"""
        await log_guild_update(self.bot, before, after)
