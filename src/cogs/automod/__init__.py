from discord.ext import commands

from .handlers import AutomodHandler


async def setup(bot: commands.Bot) -> None:
    """automodモジュールのセットアップ"""
    await bot.add_cog(AutomodHandler(bot))
