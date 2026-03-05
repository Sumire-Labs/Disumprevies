# src/cogs/automod/__init__.py

from discord.ext import commands

from .handlers import AutomodHandler, RaidHandler


async def setup(bot: commands.Bot) -> None:
    """automodモジュールのセットアップ"""
    await bot.add_cog(AutomodHandler(bot))
    await bot.add_cog(RaidHandler(bot))
