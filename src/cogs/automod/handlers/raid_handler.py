# src/cogs/automod/handlers/raid_handler.py

import discord
from discord.ext import commands

from ..detectors import is_raid_active, get_raid_status
from ..services import handle_raid_join, log_raid_activated


class RaidHandler(commands.Cog):
    """レイドプロテクションのイベントハンドラ"""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_member_join(self, member: discord.Member) -> None:
        """メンバー参加時のレイドチェック"""
        # Botは無視
        if member.bot:
            return

        # レイド発動前の状態を取得
        was_active = is_raid_active(member.guild.id)

        # レイドチェック&キック処理
        kicked = await handle_raid_join(self.bot, member)

        # 新たにレイドが発動した場合はログを送信
        if kicked and not was_active:
            status = get_raid_status(member.guild.id)
            await log_raid_activated(
                self.bot,
                member.guild,
                status.join_count
            )
