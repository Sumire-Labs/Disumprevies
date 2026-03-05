# src\cogs\automod\handlers\automod_handler.py
import discord
from discord.ext import commands

from src.core.database.repositories import GuildSettingsRepository
from src.cogs.logger.services import log_auto_delete

from ..services import (
    check_message,
    add_violation,
    check_punishment,
    apply_punishment,
)


class AutomodHandler(commands.Cog):
    """自動モデレーションのイベントハンドラ"""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message) -> None:
        """メッセージ監視"""
        # DMは無視
        if message.guild is None:
            return

        # Botは無視
        if message.author.bot:
            return

        # サーバー設定があるか確認
        settings = await GuildSettingsRepository.get(message.guild.id)
        if not settings:
            return

        # メッセージをチェック
        result = await check_message(message)
        if result is None or not result.detected:
            return

        # メッセージを削除
        try:
            await message.delete()
        except discord.Forbidden:
            return

        # 違反を記録
        points, total_points = await add_violation(
            guild_id=message.guild.id,
            user_id=message.author.id,
            violation_type=result.violation_type,
            reason=result.reason,
            message_id=message.id,
            channel_id=message.channel.id
        )

        # ログ送信
        await log_auto_delete(
            self.bot, message, result.violation_type, points, total_points
        )

        # 処分判定
        punishment = check_punishment(total_points)
        if punishment:
            punishment_type, duration = punishment
            await apply_punishment(
                self.bot,
                message.author,
                punishment_type,
                result.reason,
                total_points,
                duration
            )
