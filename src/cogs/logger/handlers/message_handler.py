import discord
from discord.ext import commands

from ..services import (
    log_message_delete,
    log_message_bulk_delete,
    log_message_edit,
)


class MessageHandler(commands.Cog):
    """メッセージ関連のイベントハンドラ"""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_message_delete(self, message: discord.Message) -> None:
        """メッセージ削除イベント"""
        # DMは無視
        if message.guild is None:
            return

        # Botのメッセージは無視
        if message.author.bot:
            return

        await log_message_delete(self.bot, message)

    @commands.Cog.listener()
    async def on_bulk_message_delete(self, messages: list[discord.Message]) -> None:
        """メッセージ一括削除イベント"""
        if not messages:
            return

        # 最初のメッセージからチャンネルを取得
        channel = messages[0].channel

        # DMは無視
        if not isinstance(channel, discord.TextChannel):
            return

        await log_message_bulk_delete(self.bot, channel, messages)

    @commands.Cog.listener()
    async def on_message_edit(
        self,
        before: discord.Message,
        after: discord.Message
    ) -> None:
        """メッセージ編集イベント"""
        # DMは無視
        if before.guild is None:
            return

        # Botのメッセージは無視
        if before.author.bot:
            return

        # 内容が同じ場合は無視（埋め込みの展開など）
        if before.content == after.content:
            return

        await log_message_edit(self.bot, before, after)
