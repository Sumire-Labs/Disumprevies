# src\cogs\logger\__init__.py
from discord.ext import commands

from .handlers import (
    MessageHandler,
    MemberHandler,
    ServerHandler,
    VoiceHandler,
)


async def setup(bot: commands.Bot) -> None:
    """loggerモジュールのセットアップ"""
    await bot.add_cog(MessageHandler(bot))
    await bot.add_cog(MemberHandler(bot))
    await bot.add_cog(ServerHandler(bot))
    await bot.add_cog(VoiceHandler(bot))
