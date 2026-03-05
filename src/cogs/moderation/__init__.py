# src/cogs/moderation/__init__.py

from discord.ext import commands

from .commands import (
    WarnCommand,
    TimeoutCommand,
    KickCommand,
    BanCommand,
    UnbanCommand,
    InfractionsCommand,
    AddpointsCommand,
    RemovepointsCommand,
    ClearpointsCommand,
)


async def setup(bot: commands.Bot) -> None:
    """moderationモジュールのセットアップ"""
    await bot.add_cog(WarnCommand(bot))
    await bot.add_cog(TimeoutCommand(bot))
    await bot.add_cog(KickCommand(bot))
    await bot.add_cog(BanCommand(bot))
    await bot.add_cog(UnbanCommand(bot))
    await bot.add_cog(InfractionsCommand(bot))
    await bot.add_cog(AddpointsCommand(bot))
    await bot.add_cog(RemovepointsCommand(bot))
    await bot.add_cog(ClearpointsCommand(bot))
