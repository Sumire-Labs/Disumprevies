# src/cogs/automod/handlers/join_handler.py

import discord
from discord.ext import commands

from ..detectors import is_raid_active, get_raid_status
from ..services import (
    handle_raid_join,
    handle_new_account,
    log_raid_activated,
)


class JoinHandler(commands.Cog):
    """参加時のイベントハンドラ（レイド・新規アカウント）"""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_member_join(self, member: discord.Member) -> None:
        """メンバー参加時の処理"""
        # Botは無視
        if member.bot:
            return

        # レイドチェック（キックされた場合は以降の処理をスキップ）
        kicked = await self._handle_raid(member)
        if kicked:
            return

        # 新規アカウントチェック
        await handle_new_account(self.bot, member)

    async def _handle_raid(self, member: discord.Member) -> bool:
        """レイドチェック処理"""
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

        return kicked
