# src\cogs\logger\handlers\voice_handler.py
import discord
from discord.ext import commands

from ..services import (
    log_voice_join,
    log_voice_leave,
    log_voice_move,
    log_voice_mute,
    log_voice_deafen,
)


class VoiceHandler(commands.Cog):
    """ボイスチャンネル関連のイベントハンドラ"""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_voice_state_update(
        self,
        member: discord.Member,
        before: discord.VoiceState,
        after: discord.VoiceState
    ) -> None:
        """ボイス状態更新イベント"""
        # Botは無視
        if member.bot:
            return

        # チャンネル参加
        if before.channel is None and after.channel is not None:
            await log_voice_join(self.bot, member, after.channel)
            return

        # チャンネル退出
        if before.channel is not None and after.channel is None:
            await log_voice_leave(self.bot, member, before.channel)
            return

        # チャンネル移動
        if (
            before.channel is not None
            and after.channel is not None
            and before.channel != after.channel
        ):
            await log_voice_move(self.bot, member, before.channel, after.channel)
            return

        # サーバーミュート状態の変更
        if before.mute != after.mute:
            await log_voice_mute(self.bot, member, after.mute, by_server=True)

        # 自己ミュート状態の変更
        if before.self_mute != after.self_mute:
            await log_voice_mute(self.bot, member, after.self_mute, by_server=False)

        # サーバースピーカーミュート状態の変更
        if before.deaf != after.deaf:
            await log_voice_deafen(self.bot, member, after.deaf, by_server=True)

        # 自己スピーカーミュート状態の変更
        if before.self_deaf != after.self_deaf:
            await log_voice_deafen(self.bot, member, after.self_deaf, by_server=False)
